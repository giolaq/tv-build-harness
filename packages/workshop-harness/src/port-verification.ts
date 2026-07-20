import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type PortCheck =
  | { type: "file_exists" | "contains"; path: string; value?: string; label: string }
  | { type: "command"; command: string; args: string[]; label: string };

export function verifyPort(appDir: string, checks: PortCheck[]): string[] {
  const failures: string[] = [];
  for (const check of checks) {
    if (check.type === "command") {
      try { execFileSync(check.command, check.args, { cwd: appDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
      catch (error) { failures.push(`${check.label}: ${error instanceof Error ? error.message : String(error)}`); }
      continue;
    }
    const path = join(appDir, check.path);
    if (!existsSync(path)) { failures.push(`${check.label}: missing ${check.path}`); continue; }
    if (check.type === "contains" && !readFileSync(path, "utf8").includes(check.value ?? "")) failures.push(`${check.label}: ${check.path} must contain ${JSON.stringify(check.value)}`);
  }
  return failures;
}
