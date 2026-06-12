import { accessSync, constants } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

let resolvedClaude: string | null | undefined;

/**
 * Resolves a verified-executable claude binary: CLAUDE_PATH, then well-known
 * locations, then PATH lookup. Returns null when nothing usable is found.
 * Memoized — the binary can't move mid-process.
 */
export function resolveClaude(): string | null {
  if (resolvedClaude !== undefined) return resolvedClaude;

  const candidates = [
    process.env.CLAUDE_PATH,
    join(process.env.HOME ?? "", ".toolbox", "bin", "claude"),
    join(process.env.HOME ?? "", ".local", "bin", "claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      accessSync(p, constants.X_OK);
      resolvedClaude = p;
      return p;
    } catch {}
  }

  // PATH lookup: let the OS resolve it, verified by a cheap spawn at use time.
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (!dir) continue;
    try {
      accessSync(join(dir, "claude"), constants.X_OK);
      resolvedClaude = join(dir, "claude");
      return resolvedClaude;
    } catch {}
  }

  resolvedClaude = null;
  return null;
}

/** Like resolveClaude, but falls back to bare "claude" for spawn-time resolution. */
export function findClaude(): string {
  return resolveClaude() ?? "claude";
}

/** Spawn env for claude and dev-server subprocesses (toolbox PATH appended). */
export function claudeEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: `${process.env.PATH}:${process.env.HOME}/.toolbox/bin` };
}

export interface ClaudeInvocation {
  prompt: string;
  cwd: string;
  timeoutMs?: number;
  model?: string;
  allowedTools?: string;
  /** Raw stream-json events, in order. Fires for every parsed line. */
  onEvent?: (event: Record<string, unknown>) => void;
}

export interface ClaudeResult {
  text: string;
  tokensUsed: number;
  costUsd: number;
}

/** Carries whatever usage was parsed before the CLI failed, so callers can still book it. */
export class ClaudeCliError extends Error {
  constructor(message: string, public readonly partial: ClaudeResult) {
    super(message);
    this.name = "ClaudeCliError";
  }
}

const STDERR_CAP = 4096;

/**
 * Runs `claude -p` with stream-json output. The prompt goes via stdin (shell
 * escaping has eaten prompts before). Resolves with the final result text plus
 * token/cost totals parsed from the result event. On CLI failure, rejects with
 * a ClaudeCliError that carries any usage parsed before the failure.
 */
export function invokeClaude(opts: ClaudeInvocation): Promise<ClaudeResult> {
  const {
    prompt,
    cwd,
    timeoutMs = 600_000,
    model,
    allowedTools = "Bash,Read,Write,Edit",
    onEvent,
  } = opts;

  return new Promise((resolve, reject) => {
    const child = spawn(findClaude(), [
      "-p", "-",
      "--allowedTools", allowedTools,
      "--output-format", "stream-json",
      "--verbose",
      ...(model ? ["--model", model] : []),
    ], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: claudeEnv(),
    });

    let buffer = "";
    let stderr = "";
    const result: ClaudeResult = { text: "", tokensUsed: 0, costUsd: 0 };

    const consumeLine = (line: string) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        onEvent?.(event);
        if (event.type === "result") {
          result.text = event.result ?? "";
          result.tokensUsed = (event.usage?.input_tokens ?? 0) + (event.usage?.output_tokens ?? 0);
          result.costUsd = event.total_cost_usd ?? 0;
        }
      } catch {}
    };

    child.stdout!.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) consumeLine(line);
    });

    child.stderr!.on("data", (chunk: Buffer) => {
      if (stderr.length < STDERR_CAP) stderr += chunk.toString();
    });

    child.stdin!.write(prompt);
    child.stdin!.end();

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new ClaudeCliError(`claude CLI timed out after ${timeoutMs}ms`, result));
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (buffer.trim()) consumeLine(buffer);
      if (code !== 0) {
        reject(new ClaudeCliError(`claude CLI exited with ${code}: ${stderr.slice(0, 500)}`, result));
      } else {
        resolve(result);
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new ClaudeCliError(`claude CLI error: ${err.message}`, result));
    });
  });
}
