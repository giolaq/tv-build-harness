import Anthropic from "@anthropic-ai/sdk";
import { join } from "node:path";
import type { RunContext } from "./run-context.js";
import { Recorder, ReplayClient, responseText } from "./recorder.js";

export type ModelResult = { text: string; costUsd: number };
export interface Executor { call(phase: string, prompt: string): Promise<ModelResult>; }

export function createExecutor(ctx: RunContext, replayPath?: string): Executor {
  return replayPath ? new ReplayExecutor(replayPath) : new AnthropicExecutor(ctx);
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

class AnthropicExecutor implements Executor {
  private model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
  private recorder: Recorder;
  constructor(ctx: RunContext) { this.recorder = new Recorder(join(ctx.outDir, "recording.json")); }
  async call(phase: string, prompt: string): Promise<ModelResult> {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY or pass --replay <recording.json>");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: "Return only JSON: {\"summary\":\"...\",\"files\":{\"out/path\":\"contents\"}}.",
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    this.recorder.record({ timestamp: new Date().toISOString(), phase, request: { model: this.model, system: "mini-harness", messages: [{ role: "user", content: prompt }] }, response: [{ type: "result", result: text }], usage: msg.usage });
    return { text, costUsd: (msg.usage.input_tokens + msg.usage.output_tokens) / 1_000_000 };
  }
}
