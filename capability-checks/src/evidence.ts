import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

export const EVIDENCE_DIR = join(import.meta.dirname, "..", "..", "evidence", "capability-checks");

export async function saveRun(checkId: string, record: Record<string, any>): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(EVIDENCE_DIR, checkId, stamp);
  await mkdir(dir, { recursive: true });

  // Download every successful output while its URL (valid 2 hours) still works.
  for (const [i, step] of (record.steps ?? []).entries()) {
    const url = step.result?.resultUrl;
    if (!url) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get("content-type") ?? "";
      const ext = type.includes("png") ? "png" : type.includes("mp4") ? "mp4" : "jpg";
      const file = `output-${i + 1}.${ext}`;
      await writeFile(join(dir, file), Buffer.from(await res.arrayBuffer()));
      step.savedOutput = file;
    } catch (e) {
      step.savedOutputError = String(e);
    }
  }

  // Store input paths relative to the repo, not the local machine.
  for (const step of record.steps ?? []) {
    for (const [k, v] of Object.entries(step.inputs ?? {})) {
      if (typeof v === "string" && v.startsWith("/")) step.inputs[k] = relative(join(EVIDENCE_DIR, "..", ".."), v);
    }
  }

  await writeFile(join(dir, "result.json"), JSON.stringify(record, null, 2));
  return dir;
}
