import { spawn } from "node:child_process";

export interface CommandRequest {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs: number;
  stdin?: string;
  redact?: string[];
  maxOutputBytes?: number;
}

export interface CommandResult {
  exitCode: number | null;
  signal?: NodeJS.Signals;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
}

export interface CommandRunner {
  run(request: CommandRequest): Promise<CommandResult>;
}

export class NodeCommandRunner implements CommandRunner {
  run(request: CommandRequest): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const limit = request.maxOutputBytes ?? 1_000_000;
      const child = spawn(request.command, request.args ?? [], {
        cwd: request.cwd,
        env: { ...process.env, ...request.env },
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let truncated = false;
      let timedOut = false;

      const append = (current: string, chunk: Buffer): string => {
        if (Buffer.byteLength(current) >= limit) {
          truncated = true;
          return current;
        }
        const next = current + chunk.toString();
        if (Buffer.byteLength(next) <= limit) return next;
        truncated = true;
        return Buffer.from(next).subarray(0, limit).toString();
      };
      child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
      child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
      child.on("error", reject);

      const terminate = (signal: NodeJS.Signals) => {
        try {
          if (child.pid && process.platform !== "win32") process.kill(-child.pid, signal);
          else child.kill(signal);
        } catch {}
      };
      const timer = setTimeout(() => {
        timedOut = true;
        terminate("SIGTERM");
        setTimeout(() => terminate("SIGKILL"), 2_000).unref();
      }, request.timeoutMs);
      timer.unref();

      child.on("close", (exitCode, signal) => {
        clearTimeout(timer);
        const scrub = (value: string) => (request.redact ?? []).reduce(
          (text, secret) => secret ? text.split(secret).join("[REDACTED]") : text,
          value,
        );
        resolve({
          exitCode,
          signal: signal ?? undefined,
          stdout: scrub(stdout),
          stderr: scrub(stderr),
          durationMs: Date.now() - started,
          timedOut,
          truncated,
        });
      });
      if (request.stdin !== undefined) child.stdin.end(request.stdin);
      else child.stdin.end();
    });
  }
}

export const commandRunner: CommandRunner = new NodeCommandRunner();
