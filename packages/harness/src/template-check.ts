import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_HARNESS_CONFIG, loadHarnessConfig } from "./harness-config.js";
import type { HarnessConfig } from "./harness-config.js";

export interface TemplateCheck {
  source: string;
  repo: string;
  commit: string;
  upstreamHead?: string;
  status: "current" | "behind" | "unknown";
  error?: string;
}

export function collectTemplateInputs(root = process.cwd()): { source: string; config: HarnessConfig }[] {
  const entries: { source: string; config: HarnessConfig }[] = [
    { source: "defaults", config: DEFAULT_HARNESS_CONFIG },
  ];
  for (const examplesRoot of [resolve(root, "examples"), resolve(root, "..", "..", "examples")]) {
    if (!existsSync(examplesRoot)) continue;
    for (const name of readdirSync(examplesRoot)) {
      const inputDir = join(examplesRoot, name);
      try {
        const { config, source } = loadHarnessConfig({ inputDir, cwd: root });
        entries.push({ source: source === "defaults" ? `examples/${name} (defaults)` : source, config });
      } catch {
        // Validation reports malformed configs; template check only reports loadable refs.
      }
    }
    break;
  }
  return entries;
}

export function checkTemplates(
  inputs = collectTemplateInputs(),
  exec: (command: string) => string = (command) => execSync(command, { encoding: "utf-8", stdio: "pipe", timeout: 30_000 })
): TemplateCheck[] {
  const seen = new Set<string>();
  const checks: TemplateCheck[] = [];
  for (const { source, config } of inputs) {
    const key = `${config.template.repo}#${config.template.commit}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const base = { source, repo: config.template.repo, commit: config.template.commit };
    try {
      const output = exec(`git ls-remote ${config.template.repo} HEAD`);
      const upstreamHead = output.trim().split(/\s+/)[0];
      checks.push({
        ...base,
        upstreamHead,
        status: upstreamHead === config.template.commit ? "current" : "behind",
      });
    } catch (err) {
      checks.push({
        ...base,
        status: "unknown",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return checks;
}
