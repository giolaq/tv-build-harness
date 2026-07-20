import { z } from "zod";
import type { Phase } from "./harness-config.js";
import { writeCheckpoint } from "./checkpoint.js";
import { commitPhase, RunContext, writeFiles, writeReport } from "./run-context.js";
import { verify } from "./verify.js";

const Output = z.object({ summary: z.string(), files: z.record(z.string(), z.string()) });
type CallModel = (phase: string, prompt: string) => Promise<{ text: string; costUsd: number }>;

export async function runPipeline(phases: Phase[], ctx: RunContext, callModel: CallModel, startAt = 0, stopAfter?: string): Promise<boolean> {
  for (let index = startAt; index < phases.length; index++) {
    const phase = phases[index];
    const output = await runPhase(phase, ctx, callModel);
    ctx.summaries.push(`## ${phase.name}\n\n${output.summary}\n`);
    commitPhase(ctx, phase.name);
    writeCheckpoint(ctx.outDir, { nextPhase: index + 1, summaries: ctx.summaries, costUsd: ctx.costUsd });
    if (phase.name === stopAfter) return false;
  }
  writeReport(ctx);
  return true;
}

async function runPhase(phase: Phase, ctx: RunContext, callModel: CallModel) {
  let failure = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const prior = ctx.summaries.at(-1) ?? "No prior phase has run.";
    const prompt = [`Phase: ${phase.name}`, `Prior summary: ${prior}`, failure && `Previous verification failed: ${failure}`, phase.prompt].filter(Boolean).join("\n\n");
    const result = await callModel(phase.name, prompt);
    ctx.costUsd += result.costUsd;
    const output = Output.parse(JSON.parse(result.text.match(/\{[\s\S]*\}/)?.[0] ?? "{}"));
    writeFiles(ctx, output.files);
    failure = verify(phase.verify) ?? "";
    if (!failure) return output;
    console.log(`${phase.name}: verify failed: ${failure}`);
  }
  throw new Error(`Phase ${phase.name} failed after retry: ${failure}`);
}
