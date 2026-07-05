import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const value = (name: string): string | undefined => {
  const flag = args.indexOf(name);
  return flag >= 0 ? args[flag + 1] : undefined;
};
const option = (name: string, fallback: string): string => {
  const prefix = `${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? value(name) ?? fallback;
};

const exitCode = Number(option("--fake-exit-code", "0"));
const schemaVersion = Number(option("--fake-schema-version", "1"));
const runId = option("--fake-run-id", "fake-run");
const cost = Number(option("--fake-cost", "0.25"));
const seed = value("--seed") ?? "fake-random-seed";
const inputDir = args.at(-1);

if (!args.includes("--json") || !args.includes("--no-tui") || !args.includes("--generate-only")) {
  console.error("missing required harness flags");
  process.exit(3);
}

if (!inputDir || !existsSync(resolve(inputDir))) {
  console.error(`input dir missing or split incorrectly: ${inputDir ?? "<none>"}`);
  process.exit(3);
}

if (args.includes("--fake-stderr")) {
  console.error("stray human stderr from fake harness");
}

const outDir = join(process.cwd(), "out", runId);
mkdirSync(join(outDir, "app"), { recursive: true });

function emit(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ schemaVersion, ...payload })}\n`);
}

emit({ event: "run_start", mode: "claude-run", seed });

if (args.includes("--fake-schema-only")) {
  process.exit(exitCode);
}

emit({ event: "phase_start", phase: "branding" });
emit({ event: "phase_complete", phase: "branding", result: { phase: "branding", status: "success", iterations: 1 }, cost });
emit({
  event: "run_complete",
  runId,
  outDir,
  seed,
  status: exitCode === 0 ? "success" : "failed",
  costSoFar: cost,
  phases: [{ phase: "branding", status: exitCode === 0 ? "success" : "failed", iterations: 1 }],
});

process.exit(exitCode);
