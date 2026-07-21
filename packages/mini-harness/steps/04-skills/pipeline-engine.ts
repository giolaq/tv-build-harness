import { z } from "zod";
import type { Executor } from "./executor.js";
import type { Phase } from "./harness-config.js";
import { buildPhasePrompt } from "./phase-context.js";
import { writeCheckpoint } from "./checkpoint.js";
import { commitPhase, RunContext, writeFiles, writeReport } from "./run-context.js";
import { loadSkills } from "./skills.js";
import { verify } from "./verify.js";

const Output = z.object({ summary: z.string(), files: z.record(z.string(), z.string()) });

export async function runPipeline(phases: Phase[], ctx: RunContext, executor: Executor, startAt = 0): Promise<void> {
  for (let index = startAt; index < phases.length; index++) {
    const phase = phases[index];
    const output = await runPhase(phase, ctx, executor);
    ctx.summaries.push(`## ${phase.name}\n\n${output.summary}\n`);
    commitPhase(ctx, phase.name);
    writeCheckpoint(ctx.outDir, { nextPhase: index + 1, summaries: ctx.summaries, costUsd: ctx.costUsd });
  }
  writeReport(ctx);
}

async function runPhase(phase: Phase, ctx: RunContext, executor: Executor) {
  const skills = loadSkills(phase.skills);
  let failure = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await executor.call(phase.name, buildPhasePrompt(phase, ctx, failure), skills);
    ctx.costUsd += result.costUsd;
    const output = Output.parse(JSON.parse(result.text.match(/\{[\s\S]*\}/)?.[0] ?? "{}"));
    writeFiles(ctx, output.files);
    failure = verify(phase.verify) ?? "";
    if (!failure) return output;
    console.log(`${phase.name}: verify failed: ${failure}`);
  }
  throw new Error(`Phase ${phase.name} failed after retry: ${failure}`);
}
