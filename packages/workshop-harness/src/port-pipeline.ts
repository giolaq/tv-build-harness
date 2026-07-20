import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderAdbtPrompt, type AdbtContextProvider, type AdbtPortContext } from "./context-providers/adbt.js";
import type { AuditFinding } from "./contracts.js";
import { PortOutputSchema } from "./port-contract.js";
import type { PortExecutor } from "./port-executor.js";
import { verifyPort, type PortCheck } from "./port-verification.js";

const tsxLoader = pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), "../node_modules/tsx/dist/loader.mjs")).href;
export type PortPhase = { name: string; goal: string; skill: string; checks: PortCheck[] };
export type PortResult = {
  phases: { name: string; summary: string; attempts: number; checks: string[] }[];
  costUsd: number;
  adbt?: { mode: "live" | "replay"; documents: string[]; evidence: string };
};

export class PortBudgetError extends Error {}

export async function runPortPipeline(options: { appDir: string; outDir: string; findings: AuditFinding[]; projectContext: string; seed: string; maxCostUsd: number; executor: PortExecutor; adbt: AdbtContextProvider; onPhase?: (phase: string) => void }): Promise<PortResult> {
  mkdirSync(options.outDir, { recursive: true });
  initializeGit(options.appDir);
  const result: PortResult = { phases: [], costUsd: 0 };
  let adbtContext: AdbtPortContext | undefined;
  for (const phase of phases()) {
    options.onPhase?.(phase.name);
    if (phase.name === "vega_port") {
      adbtContext = await options.adbt.load();
      const evidence = join(options.outDir, "adbt-port-context.json");
      writeFileSync(evidence, JSON.stringify(adbtContext, null, 2));
      result.adbt = { mode: adbtContext.mode, documents: adbtContext.documents.map((document) => document.name), evidence };
    }
    const start = gitHead(options.appDir);
    let failures: string[] = [];
    try {
      for (let attempt = 1; attempt <= 2; attempt++) {
        if (attempt > 1) reset(options.appDir, start);
        if (phase.name === "vega_port" && adbtContext) ensureAdbtNextSteps(options.appDir, adbtContext);
        const model = await options.executor.call(phase.name, prompt(phase, options, failures, adbtContext));
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
    { name: "vega_port", goal: "Create an apps/vega package boundary from the SDK application shape and isolate incompatible behavior without deleting reusable source logic.", skill: "Follow the injected ADBT workflows before making Vega claims. Preserve portable JS/TSX, inspect native dependencies, start from the Vega template shape, and record unsupported gaps instead of inventing APIs.", checks: [{ type: "contains", path: "apps/vega/manifest.toml", value: "schema-version = 1", label: "Vega manifest schema" }, { type: "contains", path: "apps/vega/manifest.toml", value: "[[components.interactive]]", label: "Interactive component" }, { type: "contains", path: "apps/vega/package.json", value: "build-vega", label: "Vega React Native build" }, { type: "file_exists", path: "apps/vega/app.json", label: "Vega app registration" }, { type: "file_exists", path: "apps/vega/metro.config.js", label: "Vega Metro boundary" }, { type: "contains", path: "package.json", value: "vega:build", label: "Vega build script" }, { type: "file_exists", path: "src/tv/focus-state.ts", label: "Focus state adapter" }, { type: "contains", path: "NextSteps.md", value: "ADBT", label: "ADBT gaps and sources" }] },
    { name: "tv_behavior", goal: "Adapt the selected home-to-details flow for remote-only operation and prove its focus transitions with executable checks.", skill: "Use one focus-state module from both the app and the verifier. Verify launch, movement boundaries, details, back, and restoration.", checks: [{ type: "contains", path: "src/App.tsx", value: "./tv/focus-state", label: "App uses shared focus state" }, { type: "command", command: process.execPath, args: ["--import", tsxLoader, "tests/verify-tv-focus.ts"], label: "Executable focus transitions" }, { type: "contains", path: "tv-focus-result.json", value: "\"passed\": true", label: "Focus evidence report" }, { type: "contains", path: "TV_VERIFICATION.md", value: "originating card", label: "Focus restoration documented" }] },
  ];
}

function prompt(phase: PortPhase, options: Parameters<typeof runPortPipeline>[0], failures: string[], adbt?: AdbtPortContext): string {
  const checks = phase.checks.map((check) => check.type === "command" ? `- ${check.label}: ${check.command} ${check.args.join(" ")}` : `- ${check.label}: ${check.path}${check.value ? ` contains ${check.value}` : " exists"}`).join("\n");
  const adbtGuidance = phase.name === "vega_port" && adbt
    ? `\n\n${renderAdbtPrompt(adbt)}\n\nUse these ADBT sources for Vega-specific decisions. Do not invent Vega APIs. Write unsupported or uncertain mappings to NextSteps.md and name the ADBT documents consulted.`
    : "";
  return `You are porting the CURRENT guarded React Native app to Vega SDK 0.22.5875. Read existing files before proposing edits. Preserve unrelated work.\n\nPhase: ${phase.name}\nGoal: ${phase.goal}\nSkill: ${phase.skill}\nCreative seed: ${options.seed}\n\nApproved context:\n${options.projectContext}\n\nPortability findings:\n${JSON.stringify(options.findings, null, 2)}${adbtGuidance}\n\nRequired checks:\n${checks}\n${failures.length ? `\nPrevious attempt failed:\n${failures.map((f) => `- ${f}`).join("\n")}\nFix these exact failures.` : ""}\n\nReturn ONLY JSON: {"summary":"short commit summary","files":{"relative/path":"complete file contents"}}. Paths are relative to the app root. Do not include .git, node_modules, .env, absolute paths, or files outside the app.`;
}

function parseOutput(text: string) { return PortOutputSchema.parse(JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}")); }
function ensureAdbtNextSteps(appDir: string, context: AdbtPortContext) {
  const path = join(appDir, "NextSteps.md");
  const current = existsSync(path) ? readFileSync(path, "utf8").trimEnd() : "# Next Steps";
  if (current.includes("## ADBT sources")) return;
  const sources = context.documents.map((document) => `- ${document.name} (${document.sha256})`).join("\n");
  writeFileSync(path, `${current}\n\n## ADBT sources\n\n${sources}\n\n## Unsupported mappings\n\nAdd Vega gaps or manual work here during the port.\n`);
}
function writeOutput(appDir: string, files: Record<string, string>) { const root = resolve(appDir); for (const [name, content] of Object.entries(files)) { const path = resolve(root, name); if (!path.startsWith(`${root}${sep}`) || /(^|[\\/])(?:\.git|node_modules)(?:[\\/]|$)|(^|[\\/])\.env(?:\.|[\\/]|$)/.test(name)) throw new Error(`Unsafe model output path: ${name}`); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); } }
function git(appDir: string, args: string[]) { return execFileSync("git", args, { cwd: appDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
function initializeGit(appDir: string) { git(appDir, ["init"]); git(appDir, ["config", "user.email", "workshop@local"]); git(appDir, ["config", "user.name", "Workshop Harness"]); git(appDir, ["add", "-A"]); git(appDir, ["commit", "-m", "workshop: import guarded source"]); }
function gitHead(appDir: string) { return git(appDir, ["rev-parse", "HEAD"]); }
function reset(appDir: string, head: string) { git(appDir, ["reset", "--hard", head]); git(appDir, ["clean", "-fd"]); }
function commit(appDir: string, message: string) { git(appDir, ["add", "-A"]); git(appDir, ["commit", "-m", message]); }
