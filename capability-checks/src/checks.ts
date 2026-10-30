import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { runTask, uploadFile, listTemplates, type TaskResult } from "./youcam.js";
import { EVIDENCE_DIR } from "./evidence.js";

const INPUTS = join(import.meta.dirname, "..", "inputs");
const CLOTH_PATH = `/s2s/v2.0/task/${process.env.CLOTH_ENDPOINT ?? "cloth-v3"}`;

// Sample reference garment from YouCam's own docs, so check 1 isolates the user photo.
const DOCS_SAMPLE_OUTFIT =
  "https://plugins-media.makeupar.com/strapi/assets/clothes_reference_full_body_01_5a000d999f.png";

/** Finds inputs/<name>.jpg|.jpeg|.png. */
async function input(name: string): Promise<string> {
  for (const ext of [".jpg", ".jpeg", ".png"]) {
    const p = join(INPUTS, name + ext);
    try {
      await access(p);
      return p;
    } catch {}
  }
  throw new Error(`Missing input image: capability-checks/inputs/${name}.jpg (or .png). See inputs/README.md.`);
}

export type Step = { label: string; inputs: Record<string, string>; result: TaskResult };
export type CheckOutput = { steps: Step[]; notes?: string[]; data?: unknown };

export type Check = {
  id: string;
  question: string;
  estimatedUnits: number;
  run: () => Promise<CheckOutput>;
};

async function clothes(srcFile: string | { url: string }, ref: { file?: string; url?: string }, category: string) {
  const body: Record<string, unknown> = { garment_category: category };
  if (typeof srcFile === "string") body.src_file_id = await uploadFile(srcFile);
  else body.src_file_url = srcFile.url;
  if (ref.file) body.ref_file_id = await uploadFile(ref.file);
  else body.ref_file_url = ref.url;
  return runTask(CLOTH_PATH, body);
}

async function latestResultUrl(checkId: string): Promise<{ url: string; ageMinutes: number } | null> {
  const dir = join(EVIDENCE_DIR, checkId);
  let runs: string[];
  try {
    runs = (await readdir(dir)).sort();
  } catch {
    return null;
  }
  for (const run of runs.reverse()) {
    try {
      const json = JSON.parse(await readFile(join(dir, run, "result.json"), "utf8"));
      const step = json.steps?.find((s: Step) => s.result.status === "success" && s.result.resultUrl);
      if (step) return { url: step.result.resultUrl, ageMinutes: (Date.now() - Date.parse(json.finishedAt)) / 60000 };
    } catch {}
  }
  return null;
}

const NATURAL_LOOK = {
  version: "1.0",
  effects: [
    { category: "skin_smooth", skinSmoothStrength: 40, skinSmoothColorIntensity: 30 },
    { category: "lip_color", shape: { name: "original" }, style: { type: "full" },
      palettes: [{ color: "#B5656B", texture: "satin", colorIntensity: 45 }] },
    { category: "blush", pattern: { name: "1color1" },
      palettes: [{ color: "#D98C8C", texture: "matte", colorIntensity: 35 }] },
  ],
};

const GALA_LOOK = {
  version: "1.0",
  effects: [
    { category: "skin_smooth", skinSmoothStrength: 55, skinSmoothColorIntensity: 45 },
    { category: "eye_shadow", pattern: { name: "1color1" },
      palettes: [{ color: "#5B3A29", texture: "shimmer", shimmerColor: "#E6C27A", shimmerIntensity: 60, colorIntensity: 70 }] },
    { category: "eye_liner", pattern: { name: "Arabic3" },
      palettes: [{ color: "#000000", texture: "matte", colorIntensity: 80 }] },
    { category: "blush", pattern: { name: "1color1" },
      palettes: [{ color: "#C9706B", texture: "matte", colorIntensity: 50 }] },
    { category: "lip_color", shape: { name: "original" }, style: { type: "full" },
      palettes: [{ color: "#8E1B2C", texture: "matte", colorIntensity: 85 }] },
  ],
};

export const CHECKS: Check[] = [
  {
    id: "1-clothes-full-body",
    question: "Does clothes try-on accept a full-body user photo and keep the whole body in the output?",
    estimatedUnits: 2,
    async run() {
      const src = await input("full-body");
      const result = await clothes(src, { url: DOCS_SAMPLE_OUTFIT }, "full_body");
      return {
        steps: [{ label: "full-body photo + docs sample outfit", inputs: { src, ref: DOCS_SAMPLE_OUTFIT }, result }],
        notes: ["Look at the output: is the whole body still there, or was it cropped to chest-up?"],
      };
    },
  },
  {
    id: "2-wardrobe-snap",
    question: "Is a phone snap of a garment from a real wardrobe accepted as the reference?",
    estimatedUnits: 2,
    async run() {
      const src = await input("full-body");
      const ref = await input("wardrobe-top");
      const result = await clothes(src, { file: ref }, process.env.WARDROBE_CATEGORY ?? "upper_body");
      return { steps: [{ label: "phone snap of own garment", inputs: { src, ref }, result }] };
    },
  },
  {
    id: "3-shop-product",
    question: "Is a real shop product photo accepted as the reference (buy path)?",
    estimatedUnits: 2,
    async run() {
      const src = await input("full-body");
      const ref = await input("shop-item");
      const result = await clothes(src, { file: ref }, process.env.SHOP_ITEM_CATEGORY ?? "full_body");
      return { steps: [{ label: "real e-commerce product photo", inputs: { src, ref }, result }] };
    },
  },
  {
    id: "4-ai-garment",
    question: "Is an AI-generated garment accepted, and does it look wearable on the person?",
    estimatedUnits: 3,
    async run() {
      const prompt =
        process.env.AI_GARMENT_PROMPT ??
        "Front-facing e-commerce product photo of a single floor-length emerald green satin evening gown with thin straps, " +
          "displayed flat and fully visible, plain pure white background, even studio lighting, no person, no mannequin, no other items";
      const gen = await runTask("/s2s/v2.0/task/text-to-image/youcam", {
        model: "youcam-image-v2",
        prompt,
        size: "1104*1472",
      });
      const steps: Step[] = [{ label: "generate garment", inputs: { prompt }, result: gen }];
      if (gen.status === "success" && gen.resultUrl) {
        const src = await input("full-body");
        const tryOn = await clothes(src, { url: gen.resultUrl }, "full_body");
        steps.push({ label: "try generated garment on", inputs: { src, ref: gen.resultUrl }, result: tryOn });
      }
      return { steps };
    },
  },
  {
    id: "5-chain-result-url",
    question: "Can a result URL from one task be used directly as the input of the next (outfit -> shoes)?",
    estimatedUnits: 2,
    async run() {
      const prev = await latestResultUrl("1-clothes-full-body");
      if (!prev) throw new Error("Run check 1 first; this check reuses its result URL.");
      const notes = [`Reusing check 1 result from ${Math.round(prev.ageMinutes)} min ago.`];
      if (prev.ageMinutes > 110) notes.push("That URL is near or past its 2-hour expiry; re-run check 1 if this fails.");
      const ref = await input("shop-shoes");
      const result = await runTask("/s2s/v2.0/task/shoes-transfer", {
        src_file_url: prev.url,
        ref_file_id: await uploadFile(ref),
      });
      return { steps: [{ label: "shoes on top of previous outfit result", inputs: { src: prev.url, ref }, result }], notes };
    },
  },
  {
    id: "6-makeup",
    question: "Does makeup try-on look real (natural and gala looks), not like a filter?",
    estimatedUnits: 2,
    async run() {
      const src = await input("portrait");
      const fileId = await uploadFile(src);
      const natural = await runTask("/s2s/v2.0/task/makeup-vto", { src_file_id: fileId, ...NATURAL_LOOK });
      const gala = await runTask("/s2s/v2.0/task/makeup-vto", { src_file_id: fileId, ...GALA_LOOK });
      return {
        steps: [
          { label: "natural look", inputs: { src }, result: natural },
          { label: "gala look", inputs: { src }, result: gala },
        ],
      };
    },
  },
  {
    id: "7-hairstyle",
    question: "Do the hairstyle templates include gala-appropriate styles, and does the preview look real?",
    estimatedUnits: 2,
    async run() {
      const templates = await listTemplates("/s2s/v2.1/task/template/hair-transfer");
      const templateId = process.env.HAIR_TEMPLATE_ID ?? templates[0]?.id;
      if (!templateId) throw new Error("No hairstyle templates returned.");
      const src = await input("portrait");
      const result = await runTask("/s2s/v2.1/task/hair-transfer", {
        src_file_id: await uploadFile(src),
        template_id: templateId,
      });
      return {
        steps: [{ label: `template ${templateId}`, inputs: { src, template_id: templateId }, result }],
        notes: [`${templates.length} templates listed (saved in data). Set HAIR_TEMPLATE_ID to try a specific one.`],
        data: { templates },
      };
    },
  },
  {
    id: "8-makeup-on-face-crop",
    question: "Is a face crop from the full-body photo good enough for makeup (two photos instead of three)?",
    estimatedUnits: 1,
    async run() {
      const src = await input("face-crop");
      const result = await runTask("/s2s/v2.0/task/makeup-vto", { src_file_id: await uploadFile(src), ...GALA_LOOK });
      return { steps: [{ label: "gala look on face crop", inputs: { src }, result }] };
    },
  },
];
