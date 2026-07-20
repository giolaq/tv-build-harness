import { Agent, StructuredOutputError } from "@strands-agents/sdk";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { createModel, defaultModel, type ModelConfig, type RemoteProvider } from "./model-factory.js";
import { PortOutputSchema } from "./port-contract.js";
import { PortRecorder, PortReplay } from "./port-recorder.js";
import { createProjectReadTools } from "./port-tools.js";

export type PortModelResult = { text: string; costUsd: number };
export interface PortExecutor { call(phase: string, prompt: string): Promise<PortModelResult>; }
export type ExecutorConfig = { kind: "claude-cli"; command: string; model: string } | { kind: "strands"; model: ModelConfig };

export function resolveExecutorConfig(input: { executor?: string; provider?: string; model?: string; region?: string; command?: string } = {}): ExecutorConfig {
  const kind = input.executor ?? process.env.WORKSHOP_EXECUTOR ?? "claude-cli";
  if (kind === "claude-cli") return { kind, command: input.command ?? process.env.CLAUDE_PATH ?? "claude", model: input.model ?? process.env.CLAUDE_MODEL ?? "sonnet" };
  if (kind !== "strands") throw new Error(`Unknown executor ${kind}; use claude-cli or strands`);
  const provider = (input.provider ?? process.env.WORKSHOP_PROVIDER ?? "bedrock") as RemoteProvider;
  if (!["bedrock", "openai", "openrouter"].includes(provider)) throw new Error(`Unknown Strands provider ${provider}`);
  return { kind, model: { provider, modelId: input.model ?? process.env.WORKSHOP_MODEL ?? defaultModel(provider), region: input.region ?? process.env.AWS_REGION } };
}

export function createPortExecutor(options: { appDir: string; outDir: string; replayPath?: string; config?: ExecutorConfig }): PortExecutor {
  if (PortReplay.exists(options.replayPath)) return new ReplayPortExecutor(options.replayPath);
  const config = options.config ?? resolveExecutorConfig();
  return config.kind === "strands" ? new StrandsPortExecutor(options.appDir, options.outDir, config.model) : new ClaudeCodePortExecutor(options.appDir, options.outDir, config);
}

class ReplayPortExecutor implements PortExecutor {
  private replay: PortReplay;
  constructor(path: string) { this.replay = new PortReplay(path); }
  async call(phase: string): Promise<PortModelResult> {
    const turn = this.replay.next(phase);
    return { text: responseText(turn.response, phase), costUsd: turn.costUsd ?? (turn.usage.input_tokens + turn.usage.output_tokens) / 1_000_000 };
  }
}

class StrandsPortExecutor implements PortExecutor {
  private recorder: PortRecorder;
  constructor(private appDir: string, outDir: string, private config: ModelConfig) { this.recorder = new PortRecorder(join(outDir, "port-recording.json")); }
  async call(phase: string, prompt: string): Promise<PortModelResult> {
    const agent = new Agent({
      name: `workshop-${phase}`,
      description: "Inspects a guarded React Native app and proposes a bounded Vega port patch.",
      model: createModel(this.config),
      tools: createProjectReadTools(this.appDir),
      structuredOutputSchema: PortOutputSchema,
      systemPrompt: "Inspect the guarded app with the read-only tools. Return a complete patch through the required schema. Never claim a file or API exists without reading evidence.",
      printer: false,
    });
    const result = await agent.invoke(prompt, {
      cancelSignal: AbortSignal.timeout(10 * 60_000),
      limits: { turns: 8, totalTokens: 40_000 },
    });
    if (!result.structuredOutput) throw new StructuredOutputError("Strands returned no port output");
    const text = JSON.stringify(PortOutputSchema.parse(result.structuredOutput));
    const raw = result.metrics?.accumulatedUsage;
    const usage = { input_tokens: raw?.inputTokens ?? 0, output_tokens: raw?.outputTokens ?? 0 };
    const costUsd = estimateCost(usage);
    this.recorder.record({ timestamp: new Date().toISOString(), phase, request: { model: `${this.config.provider}:${this.config.modelId}`, system: "workshop-vega-port", messages: [{ role: "user", content: prompt }] }, response: [{ type: "result", result: text }], usage, costUsd });
    return { text, costUsd };
  }
}

class ClaudeCodePortExecutor implements PortExecutor {
  private recorder: PortRecorder;
  constructor(private appDir: string, outDir: string, private config: Extract<ExecutorConfig, { kind: "claude-cli" }>) { this.recorder = new PortRecorder(join(outDir, "port-recording.json")); }
  async call(phase: string, prompt: string): Promise<PortModelResult> {
    const result = await invokeClaude(this.config.command, this.appDir, prompt, this.config.model);
    this.recorder.record({ timestamp: new Date().toISOString(), phase, request: { model: `claude-cli:${this.config.model}`, system: "workshop-vega-port", messages: [{ role: "user", content: prompt }] }, response: [{ type: "result", result: result.text }], usage: result.usage, costUsd: result.costUsd });
    return { text: result.text, costUsd: result.costUsd };
  }
}

function responseText(response: unknown, phase: string): string {
  const event = Array.isArray(response) ? response.find((item) => item && typeof item === "object" && "result" in item) as { result?: unknown } : undefined;
  if (typeof event?.result !== "string") throw new Error(`Replay response for ${phase} has no result text`);
  return event.result;
}

function estimateCost(usage: { input_tokens: number; output_tokens: number }): number {
  const inputRate = Number(process.env.WORKSHOP_INPUT_USD_PER_MTOK ?? 3);
  const outputRate = Number(process.env.WORKSHOP_OUTPUT_USD_PER_MTOK ?? 15);
  return (usage.input_tokens * inputRate + usage.output_tokens * outputRate) / 1_000_000;
}

function invokeClaude(command: string, cwd: string, prompt: string, model: string): Promise<{ text: string; costUsd: number; usage: { input_tokens: number; output_tokens: number } }> {
  return new Promise((resolve, reject) => {
    const tools = ["Read", "Glob", "Grep"].join(",");
    const child = spawn(command, ["-p", "-", "--allowedTools", tools, "--output-format", "stream-json", "--verbose", "--model", model], { cwd, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let buffer = "", stderr = "", text = "", costUsd = 0, usage = { input_tokens: 0, output_tokens: 0 };
    child.stdout.on("data", (chunk) => { buffer += chunk.toString(); const lines = buffer.split("\n"); buffer = lines.pop() ?? ""; lines.forEach(consume); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.stdin.end(prompt);
    const timer = setTimeout(() => child.kill("SIGTERM"), 10 * 60_000);
    child.on("error", reject);
    child.on("close", (code) => { clearTimeout(timer); consume(buffer); code === 0 ? resolve({ text, costUsd, usage }) : reject(new Error(`Claude Code executor exited ${code}: ${stderr.slice(0, 500)}`)); });
    function consume(line: string) { try { const event = JSON.parse(line); if (event.type === "result") { text = event.result ?? ""; costUsd = event.total_cost_usd ?? 0; usage = { input_tokens: event.usage?.input_tokens ?? 0, output_tokens: event.usage?.output_tokens ?? 0 }; } } catch {} }
  });
}
