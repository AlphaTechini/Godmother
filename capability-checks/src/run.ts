import "dotenv/config";
import { relative } from "node:path";
import { CHECKS } from "./checks.js";
import { saveRun } from "./evidence.js";
import { getBalance, YouCamError } from "./youcam.js";

const MAX_UNITS = Number(process.env.MAX_UNITS_PER_RUN ?? 20);

function usage(): never {
  console.log(`Usage: pnpm check <name...>

  balance          show remaining API units (free)
  list             list checks with estimated units
  all              run checks 1-7 in order
  <id or number>   e.g. 1, 6, 1-clothes-full-body
`);
  process.exit(1);
}

function pick(args: string[]) {
  if (args.includes("all")) return CHECKS.filter((c) => !c.id.startsWith("8-"));
  return args.map((a) => {
    const c = CHECKS.find((c) => c.id === a || c.id.startsWith(`${a}-`));
    if (!c) throw new Error(`Unknown check "${a}". Run: pnpm check list`);
    return c;
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();

  if (args[0] === "list") {
    for (const c of CHECKS) console.log(`${c.id.padEnd(24)} ~${c.estimatedUnits} units  ${c.question}`);
    return;
  }

  const before = await getBalance();
  console.log(`Balance: ${before.total} units`);
  if (args[0] === "balance") return;

  const checks = pick(args);
  const estimate = checks.reduce((s, c) => s + c.estimatedUnits, 0);
  console.log(`Running ${checks.length} check(s), estimated ${estimate} units (cap ${MAX_UNITS}).\n`);
  if (estimate > MAX_UNITS) {
    throw new Error(`Estimate ${estimate} exceeds MAX_UNITS_PER_RUN=${MAX_UNITS}. Raise it in .env if intended.`);
  }

  const summary: string[] = [];
  for (const check of checks) {
    console.log(`▶ ${check.id}\n  ${check.question}`);
    const startedAt = new Date().toISOString();
    let record: Record<string, any>;
    try {
      const out = await check.run();
      record = { check: check.id, question: check.question, startedAt, finishedAt: new Date().toISOString(), ...out };
      for (const s of out.steps) {
        const r = s.result;
        console.log(`  ${s.label}: ${r.status} in ${r.seconds}s${r.error ? ` (${r.error}: ${r.errorMessage ?? ""})` : ""}`);
      }
      for (const n of out.notes ?? []) console.log(`  note: ${n}`);
      const ok = out.steps.every((s) => s.result.status === "success");
      summary.push(`${ok ? "PASS" : "FAIL"}  ${check.id}`);
    } catch (e) {
      const err = e instanceof YouCamError ? { message: e.message, body: e.body } : { message: String(e) };
      record = { check: check.id, question: check.question, startedAt, finishedAt: new Date().toISOString(), steps: [], error: err };
      console.log(`  error: ${err.message}`);
      if (err.body) console.log(`  body: ${JSON.stringify(err.body)}`);
      summary.push(`ERROR ${check.id}`);
    }
    const dir = await saveRun(check.id, record);
    console.log(`  saved: ${relative(process.cwd(), dir)}\n`);
  }

  const after = await getBalance();
  console.log(summary.join("\n"));
  console.log(`\nUnits spent: ${Math.round((before.total - after.total) * 100) / 100}. Remaining: ${after.total}.`);
  console.log("PASS only means the API returned a result. Open the saved outputs and judge the quality yourself.");
}

main().catch((e) => {
  console.error(e instanceof YouCamError ? `${e.message}\n${JSON.stringify(e.body)}` : e);
  process.exit(1);
});
