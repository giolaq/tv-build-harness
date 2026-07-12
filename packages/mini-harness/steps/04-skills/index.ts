#!/usr/bin/env node
import { readCheckpoint } from "./checkpoint.js";
import { createExecutor } from "./executor.js";
import { loadHarnessConfig } from "./harness-config.js";
import { runPipeline } from "./pipeline-engine.js";
import { createRunContext } from "./run-context.js";

const args = process.argv.slice(2);
const phasesPath = args[0] === "run" ? args[1] : flag("--phases") ?? args[0] ?? "fixtures/phases.json";
const replayPath = flag("--replay");
const resume = args.includes("--resume");

async function main() {
  const phases = loadHarnessConfig(phasesPath);
  const ctx = createRunContext(resume);
  const checkpoint = resume ? readCheckpoint(ctx.outDir) : null;
  if (checkpoint) Object.assign(ctx, { summaries: checkpoint.summaries, costUsd: checkpoint.costUsd });
  const executor = createExecutor(ctx, replayPath);
  await runPipeline(phases, ctx, executor, checkpoint?.nextPhase ?? 0);
  console.log(`Wrote ${ctx.outDir}/report.md ($${ctx.costUsd.toFixed(4)})`);
}

function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1); });
