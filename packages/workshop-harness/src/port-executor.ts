import { spawn } from "node:child_process";
import { join } from "node:path";
import { PortRecorder, PortReplay } from "./port-recorder.js";

export type PortModelResult = { text: string; costUsd: number };
export interface PortExecutor { call(phase: string, prompt: string): Promise<PortModelResult>; }

export function createPortExecutor(options: { appDir: string; outDir: string; replayPath?: string; command?: string }): PortExecutor {
  if (PortReplay.exists(options.replayPath)) return new ReplayPortExecutor(options.replayPath);
  return new ClaudePortExecutor(options.appDir, options.outDir, options.command);
}

class ReplayPortExecutor implements PortExecutor {
  private replay: PortReplay;
  constructor(path: string) { this.replay = new PortReplay(path); }
  async call(phase: string): Promise<PortModelResult> {
    const turn = this.replay.next(phase);
    const event = Array.isArray(turn.response) ? turn.response.find((item) => item && typeof item === "object" && "result" in item) as { result?: unknown } : undefined;
    if (typeof event?.result !== "string") throw new Error(`Replay response for ${phase} has no result text`);
    return { text: event.result, costUsd: turn.costUsd ?? (turn.usage.input_tokens + turn.usage.output_tokens) / 1_000_000 };
  }
}

class ClaudePortExecutor implements PortExecutor {
  private recorder: PortRecorder;
  private model = process.env.CLAUDE_MODEL ?? "sonnet";
  constructor(private appDir: string, outDir: string, private command = process.env.CLAUDE_PATH ?? "claude") {
    this.recorder = new PortRecorder(join(outDir, "port-recording.json"));
  }
  async call(phase: string, prompt: string): Promise<PortModelResult> {
    const result = await invoke(this.command, this.appDir, prompt, this.model);
    this.recorder.record({
      timestamp: new Date().toISOString(), phase,
      request: { model: this.model, system: "workshop-vega-port", messages: [{ role: "user", content: prompt }] },
      response: [{ type: "result", result: result.text }], usage: result.usage, costUsd: result.costUsd,
    });
    return { text: result.text, costUsd: result.costUsd };
  }
}

function invoke(command: string, cwd: string, prompt: string, model: string): Promise<{ text: string; costUsd: number; usage: { input_tokens: number; output_tokens: number } }> {
  return new Promise((resolve, reject) => {
    const tools = ["Read", "Glob", "Grep", "mcp__amazon-devices-buildertools-mcp__list_documents", "mcp__amazon-devices-buildertools-mcp__read_document", "mcp__amazon-devices-buildertools-mcp__search_documentation"].join(",");
    const child = spawn(command, ["-p", "-", "--allowedTools", tools, "--output-format", "stream-json", "--verbose", "--model", model], { cwd, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let buffer = ""; let stderr = ""; let text = ""; let costUsd = 0; let usage = { input_tokens: 0, output_tokens: 0 };
    child.stdout.on("data", (chunk) => { buffer += chunk.toString(); const lines = buffer.split("\n"); buffer = lines.pop() ?? ""; for (const line of lines) consume(line); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.stdin.write(prompt); child.stdin.end();
    const timer = setTimeout(() => child.kill("SIGTERM"), 10 * 60_000);
    child.on("error", reject);
    child.on("close", (code) => { clearTimeout(timer); consume(buffer); code === 0 ? resolve({ text, costUsd, usage }) : reject(new Error(`Claude port executor exited ${code}: ${stderr.slice(0, 500)}`)); });
    function consume(line: string) { try { const event = JSON.parse(line); if (event.type === "result") { text = event.result ?? ""; costUsd = event.total_cost_usd ?? 0; usage = { input_tokens: event.usage?.input_tokens ?? 0, output_tokens: event.usage?.output_tokens ?? 0 }; } } catch {} }
  });
}
