import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { z } from "zod";
import type { AuditFinding } from "./contracts.js";
import type { PortExecutor } from "./port-executor.js";
import { verifyPort, type PortCheck } from "./port-verification.js";

const Output = z.object({ summary: z.string(), files: z.record(z.string(), z.string()) });
export type PortPhase = { name: string; goal: string; skill: string; checks: PortCheck[] };
export type PortResult = { phases: { name: string; summary: string; attempts: number; checks: string[] }[]; costUsd: number };

export class PortBudgetError extends Error {}

export async function runPortPipeline(options: { appDir: string; outDir: string; findings: AuditFinding[]; projectContext: string; seed: string; maxCostUsd: number; executor: PortExecutor; onPhase?: (phase: string) => void }): Promise<PortResult> {
  initializeGit(options.appDir);
  const result: PortResult = { phases: [], costUsd: 0 };
  for (const phase of phases()) {
    options.onPhase?.(phase.name);
    const start = gitHead(options.appDir);
    let failures: string[] = [];
    try {
      for (let attempt = 1; attempt <= 2; attempt++) {
        if (attempt > 1) reset(options.appDir, start);
        const model = await options.executor.call(phase.name, prompt(phase, options, failures));
        result.costUsd += model.costUsd;
        if (result.costUsd > options.maxCostUsd) throw new PortBudgetError(`Port cost $${result.costUsd.toFixed(2)} exceeded $${options.maxCostUsd.toFixed(2)}`);
        const output = parseOutput(model.text);
        writeOutput(options.appDir, output.files);
        failures = verifyPort(options.appDir, phase.checks);
        if (failures.length === 0) {
          commit(options.appDir, `workshop(${phase.name}): ${output.summary.slice(0, 60)}`);
          result.phases.push({ name: phase.name, summary: output.summary, attempts: attempt, checks: phase.checks.map((check) => check.label) });
          break;
        }
        if (attempt === 2) throw new Error(`${phase.name} failed after retry: ${failures.join("; ")}`);
      }
    } catch (error) {
      reset(options.appDir, start);
      throw error;
    }
  }
  return result;
}

export function phases(): PortPhase[] {
  return [
    { name: "tv_product_spec", goal: "Write a concise migration document describing the current app, preserved product behavior, Vega replacements, and the exact remote flow.", skill: "Discovery first. Keep facts and assumptions separate. Port one vertical slice.", checks: [{ type: "contains", path: "VEGA_PORT.md", value: "## TV Flow", label: "TV flow documented" }] },
    { name: "vega_port", goal: "Create an apps/vega package boundary and replace incompatible behavior behind isolated files without deleting reusable source logic.", skill: "Use ADBT documentation for Vega claims. Add manifest metadata, a build command, and explicit focus state.", checks: [{ type: "file_exists", path: "apps/vega/manifest.toml", label: "Vega manifest" }, { type: "file_exists", path: "apps/vega/package.json", label: "Vega package" }, { type: "contains", path: "package.json", value: "vega:build", label: "Vega build script" }, { type: "file_exists", path: "src/tv/focus-state.ts", label: "Focus state adapter" }] },
    { name: "tv_behavior", goal: "Adapt the selected home-to-details flow for remote-only operation and document its mechanical transition matrix.", skill: "Verify initial focus, visible focus, directional movement, boundaries, details, back, and restoration.", checks: [{ type: "contains", path: "src/App.tsx", value: "onFocus", label: "Focus events" }, { type: "contains", path: "src/App.tsx", value: "hasTVPreferredFocus", label: "Initial focus" }, { type: "contains", path: "TV_VERIFICATION.md", value: "originating card", label: "Focus restoration evidence" }] },
  ];
}

function prompt(phase: PortPhase, options: Parameters<typeof runPortPipeline>[0], failures: string[]): string {
  return `You are porting the CURRENT guarded React Native app to Vega SDK 0.22. Read existing files before proposing edits. Preserve unrelated work.\n\nPhase: ${phase.name}\nGoal: ${phase.goal}\nSkill: ${phase.skill}\nCreative seed: ${options.seed}\n\nApproved context:\n${options.projectContext}\n\nPortability findings:\n${JSON.stringify(options.findings, null, 2)}\n\nRequired checks:\n${phase.checks.map((check) => `- ${check.label}: ${check.path}${check.value ? ` contains ${check.value}` : " exists"}`).join("\n")}\n${failures.length ? `\nPrevious attempt failed:\n${failures.map((f) => `- ${f}`).join("\n")}\nFix these exact failures.` : ""}\n\nReturn ONLY JSON: {"summary":"short commit summary","files":{"relative/path":"complete file contents"}}. Paths are relative to the app root. Do not include .git, node_modules, .env, absolute paths, or files outside the app.`;
}

function parseOutput(text: string) { return Output.parse(JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}")); }
function writeOutput(appDir: string, files: Record<string, string>) { const root = resolve(appDir); for (const [name, content] of Object.entries(files)) { const path = resolve(root, name); if (!path.startsWith(`${root}${sep}`) || /(^|[\\/])(?:\.git|node_modules)(?:[\\/]|$)|(^|[\\/])\.env(?:\.|[\\/]|$)/.test(name)) throw new Error(`Unsafe model output path: ${name}`); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); } }
function git(appDir: string, args: string[]) { return execFileSync("git", args, { cwd: appDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
function initializeGit(appDir: string) { git(appDir, ["init"]); git(appDir, ["config", "user.email", "workshop@local"]); git(appDir, ["config", "user.name", "Workshop Harness"]); git(appDir, ["add", "-A"]); git(appDir, ["commit", "-m", "workshop: import guarded source"]); }
function gitHead(appDir: string) { return git(appDir, ["rev-parse", "HEAD"]); }
function reset(appDir: string, head: string) { git(appDir, ["reset", "--hard", head]); git(appDir, ["clean", "-fd"]); }
function commit(appDir: string, message: string) { git(appDir, ["add", "-A"]); git(appDir, ["commit", "-m", message]); }
