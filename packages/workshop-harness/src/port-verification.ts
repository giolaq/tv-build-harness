import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type PortCheck = { type: "file_exists" | "contains"; path: string; value?: string; label: string };

export function verifyPort(appDir: string, checks: PortCheck[]): string[] {
  const failures: string[] = [];
  for (const check of checks) {
    const path = join(appDir, check.path);
    if (!existsSync(path)) { failures.push(`${check.label}: missing ${check.path}`); continue; }
    if (check.type === "contains" && !readFileSync(path, "utf8").includes(check.value ?? "")) failures.push(`${check.label}: ${check.path} must contain ${JSON.stringify(check.value)}`);
  }
  return failures;
}
