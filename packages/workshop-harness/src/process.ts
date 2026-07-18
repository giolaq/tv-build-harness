import { spawn } from "node:child_process";

export type ProcessResult = { code: number; stdout: string; stderr: string; timedOut: boolean };

export function runProcess(command: string, args: string[], timeoutMs = 10_000, cwd?: string): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, env: process.env });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, timeoutMs);
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 3, stdout, stderr, timedOut }); });
  });
}
