import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { ClaudeCliError, invokeClaude, type ClaudeSpawn } from "../src/claude-cli.js";
import { runPipeline } from "../src/pipeline-engine.js";
import type { PhaseSpec } from "../src/harness-config.js";
import type { PhaseResult } from "../src/types.js";

describe("Claude CLI executor subprocess behavior", () => {
  it("delivers the prompt via stdin while using stream-json mode", async () => {
    const fake = createFakeSpawn({
      stdout: [
        { type: "result", subtype: "success", result: "ok", usage: { input_tokens: 3, output_tokens: 4 }, total_cost_usd: 0.01 },
      ],
      code: 0,
    });

    await invokeClaude({
      prompt: "prompt with 'quotes' and $shell characters",
      cwd: "/tmp/app",
      spawnImpl: fake.spawn,
    });

    expect(fake.calls[0].args).toContain("-p");
    expect(fake.calls[0].args).toContain("-");
    expect(fake.calls[0].args).toContain("--output-format");
    expect(fake.calls[0].args).toContain("stream-json");
    expect(fake.stdinWrites).toEqual(["prompt with 'quotes' and $shell characters"]);
  });

  it("parses stream-json result usage and cost", async () => {
    const events: Record<string, unknown>[] = [];
    const fake = createFakeSpawn({
      stdout: [
        { type: "assistant", message: { content: [{ type: "text", text: "working" }] } },
        { type: "result", subtype: "success", result: "final text", usage: { input_tokens: 11, output_tokens: 7 }, total_cost_usd: 0.1234 },
      ],
      code: 0,
    });

    const result = await invokeClaude({
      prompt: "build",
      cwd: "/tmp/app",
      spawnImpl: fake.spawn,
      onEvent: (event) => events.push(event),
    });

    expect(result).toEqual({ text: "final text", tokensUsed: 18, costUsd: 0.1234 });
    expect(events.map((event) => event.type)).toEqual(["assistant", "result"]);
  });

  it("surfaces nonzero exits as failed phase results that the pipeline retries", async () => {
    let calls = 0;
    const spec = phase("branding", { retries: 2 });
    const retries: string[] = [];

    const results = await runPipeline({
      phases: [spec],
      maxRetries: 1,
      executor: async (): Promise<PhaseResult> => {
        calls += 1;
        if (calls === 1) {
          const fake = createFakeSpawn({
            stdout: [
              { type: "result", subtype: "success", result: "partial", usage: { input_tokens: 5, output_tokens: 6 }, total_cost_usd: 0.02 },
            ],
            stderr: "bad prompt",
            code: 2,
          });
          try {
            await invokeClaude({ prompt: "try", cwd: "/tmp/app", spawnImpl: fake.spawn });
          } catch (err) {
            expect(err).toBeInstanceOf(ClaudeCliError);
            return { phase: "branding", status: "failed", iterations: 1, error: (err as Error).message };
          }
        }
        return { phase: "branding", status: "success", iterations: 2 };
      },
      hooks: {
        onRetry: (_spec, attempt, max, result) => retries.push(`${attempt}/${max}:${result.status}`),
      },
    });

    expect(calls).toBe(2);
    expect(retries).toEqual(["1/2:failed"]);
    expect(results.get("branding")).toEqual({ phase: "branding", status: "success", iterations: 2 });
  });
});

function createFakeSpawn(input: {
  stdout: Record<string, unknown>[];
  stderr?: string;
  code: number;
}): {
  spawn: ClaudeSpawn;
  calls: Array<{ command: string; args: string[]; options: unknown }>;
  stdinWrites: string[];
} {
  const calls: Array<{ command: string; args: string[]; options: unknown }> = [];
  const stdinWrites: string[] = [];

  const spawnImpl: ClaudeSpawn = ((command: string, args: string[], options: unknown) => {
    calls.push({ command, args, options });
    const child = new EventEmitter() as any;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();
    child.stdin = new Writable({
      write(chunk, _encoding, callback) {
        stdinWrites.push(chunk.toString());
        callback();
      },
      final(callback) {
        queueMicrotask(() => {
          for (const event of input.stdout) {
            child.stdout.write(`${JSON.stringify(event)}\n`);
          }
          if (input.stderr) child.stderr.write(input.stderr);
          child.emit("close", input.code);
        });
        callback();
      },
    });
    return child;
  }) as ClaudeSpawn;

  return { spawn: spawnImpl, calls, stdinWrites };
}

function phase(name: string, override: Partial<PhaseSpec> = {}): PhaseSpec {
  return {
    name,
    kind: "agent",
    prompt: name,
    skills: [],
    deps: [],
    timeoutMs: 600_000,
    buildPhase: false,
    internalLoop: false,
    abortOnFailure: false,
    cwd: "app",
    verify: [],
    ...override,
  };
}
