#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readCheckpoint } from "./checkpoint.js";
import { loadHarnessConfig } from "./harness-config.js";
import { runPipeline } from "./pipeline-engine.js";
import { createRunContext } from "./run-context.js";
import { callLiveModel } from "../../model-runtime.js";

type RecordedTurn = { phase: string; response: unknown; usage?: { input_tokens: number; output_tokens: number } };
const args = process.argv.slice(2);
const phasesPath = args[0] === "run" ? args[1] : flag("--phases") ?? args[0] ?? "fixtures/phases.json";
const replayPath = flag("--replay");
const resume = args.includes("--resume");
const stopAfter = flag("--stop-after");
const turns: RecordedTurn[] = replayPath ? JSON.parse(readFileSync(resolve(replayPath), "utf-8")) : [];
let replayIndex = 0;

async function main() {
  const phases = loadHarnessConfig(phasesPath);
  const ctx = createRunContext(resume);
  const checkpoint = resume ? readCheckpoint(ctx.outDir) : null;
  if (checkpoint) Object.assign(ctx, { summaries: checkpoint.summaries, costUsd: checkpoint.costUsd });
  if (checkpoint && replayPath && checkpoint.nextPhase < phases.length) {
    const next = turns.findIndex((turn) => turn.phase === phases[checkpoint.nextPhase].name);
    replayIndex = Math.max(0, next);
  }
  const complete = await runPipeline(phases, ctx, callModel, checkpoint?.nextPhase ?? 0, stopAfter);
  console.log(complete ? `Wrote ${ctx.outDir}/report.md ($${ctx.costUsd.toFixed(4)})` : `Paused after ${stopAfter}. Resume from ${ctx.outDir}/checkpoint.json.`);
}

async function callModel(phase: string, prompt: string): Promise<{ text: string; costUsd: number }> {
  if (replayPath) {
    const turn = nextTurn(phase);
    const usage = turn.usage ?? { input_tokens: 0, output_tokens: 0 };
    return { text: responseText(turn.response), costUsd: (usage.input_tokens + usage.output_tokens) / 1_000_000 };
  }
  const result = await callLiveModel(prompt);
  return { text: result.text, costUsd: result.costUsd };
}

function nextTurn(phase: string): RecordedTurn {
  const turn = turns[replayIndex++];
  if (!turn) throw new Error(`Replay exhausted before ${phase}`);
  if (turn.phase !== phase) throw new Error(`Replay phase mismatch: wanted ${phase}, got ${turn.phase}`);
  return turn;
}

function responseText(response: unknown): string {
  if (typeof response === "string") return response;
  for (const event of Array.isArray(response) ? response : []) {
    const result = event && typeof event === "object" ? (event as { result?: unknown }).result : undefined;
    if (typeof result === "string") return result;
  }
  throw new Error("Replay response did not contain text");
}

function flag(name: string) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }
main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1); });
