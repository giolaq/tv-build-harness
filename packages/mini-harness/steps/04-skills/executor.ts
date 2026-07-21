import { join } from "node:path";
import { callLiveModel } from "../../model-runtime.js";
import type { RunContext } from "./run-context.js";
import { Recorder, ReplayClient, responseText } from "./recorder.js";
import type { Skill } from "./skills.js";

export type ModelResult = { text: string; costUsd: number };
export interface Executor { call(phase: string, prompt: string, skills: Skill[]): Promise<ModelResult>; }

export function createExecutor(ctx: RunContext, replayPath?: string): Executor {
  return replayPath ? new ReplayExecutor(replayPath) : new LiveExecutor(ctx);
}

class ReplayExecutor implements Executor {
  private client: ReplayClient;
  constructor(replay: string) { this.client = new ReplayClient(replay); }
  async call(phase: string): Promise<ModelResult> {
    const turn = this.client.next(phase);
    const usage = turn.usage ?? { input_tokens: 0, output_tokens: 0 };
    return { text: responseText(turn.response), costUsd: (usage.input_tokens + usage.output_tokens) / 1_000_000 };
  }
}

class LiveExecutor implements Executor {
  private recorder: Recorder;
  constructor(ctx: RunContext) { this.recorder = new Recorder(join(ctx.outDir, "recording.json")); }
  async call(phase: string, prompt: string, skills: Skill[]): Promise<ModelResult> {
    const result = await callLiveModel(prompt, skills);
    const skillNames = skills.map((skill) => skill.name).join(",") || "none";
    this.recorder.record({ timestamp: new Date().toISOString(), phase, request: { model: result.model, system: `mini-harness; skills=${result.skillMode}:${skillNames}`, messages: [{ role: "user", content: result.requestPrompt }] }, response: [{ type: "result", result: result.text }], usage: result.usage });
    return { text: result.text, costUsd: result.costUsd };
  }
}
