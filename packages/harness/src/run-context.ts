import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HarnessInput, Phase, PhaseResult, SessionState } from "./types.js";
import { RunLog } from "./run-log.js";
import { PromptLoader } from "./prompt-loader.js";
import { DEFAULT_HARNESS_CONFIG } from "./harness-config.js";
import type { HarnessConfig } from "./harness-config.js";
import { writeRunReport } from "./run-report.js";
import { writeVegaReport } from "./vega-tools.js";

export interface CreatedRunContext {
  state: SessionState;
  harness: HarnessConfig;
  log: RunLog;
}

export function createRunContext(input: HarnessInput, options: { tokenBudget?: number } = {}): CreatedRunContext {
  const harness = input.harness ?? DEFAULT_HARNESS_CONFIG;
  const runId = randomUUID().slice(0, 8);
  const outDir = join(input.workdir, "out", runId);
  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(outDir, "screenshots"), { recursive: true });

  return {
    harness,
    log: new RunLog(join(outDir, "run.log")),
    state: {
      runId,
      workdir: outDir,
      config: input.config,
      spec: null,
      currentPhase: "plan",
      phaseResults: new Map(),
      iteration: 0,
      totalIterations: 0,
      tokenBudget: options.tokenBudget ?? harness.tokenBudget,
      tokensUsed: 0,
      messages: [],
    },
  };
}

export function createPromptLoader(input: HarnessInput): PromptLoader {
  const builtinPrompts = join(import.meta.dirname ?? __dirname, "..", "prompts");
  return new PromptLoader([join(input.workdir, "prompts"), builtinPrompts]);
}

export function loadSpecIfPresent(state: SessionState, outDir: string): void {
  const specPath = join(outDir, "spec.json");
  if (existsSync(specPath)) {
    state.spec = JSON.parse(readFileSync(specPath, "utf-8"));
  }
}

export function buildVerifyVars(input: HarnessInput, state: SessionState): Record<string, string> {
  return {
    "brand.primary_color": input.brand.primary_color,
    "brand.accent_color": input.brand.accent_color,
    "brand.background_color": input.brand.background_color,
    "brand.name": input.brand.name,
    "content.title": input.content.title,
    "app.name": state.spec?.app_name ?? input.content.title,
  };
}

export function executeClonePhase(
  outDir: string,
  harness: HarnessConfig,
  onLog?: (message: string) => void
): PhaseResult {
  const appDir = join(outDir, "app");

  if (existsSync(join(appDir, "package.json"))) {
    return { phase: "scaffold", status: "success", iterations: 0 };
  }

  try {
    onLog?.("Cloning template...");
    const branchFlag = harness.template.branch ? ` --branch ${harness.template.branch}` : "";
    execSync(
      `git clone --depth 1${branchFlag} ${harness.template.repo} "${appDir}"`,
      { stdio: "pipe", timeout: 60_000 }
    );
    execSync(`rm -rf "${join(appDir, ".git")}"`, { stdio: "pipe" });
    execSync("git init && git add -A && git commit -m \"initial template\"", {
      cwd: appDir, stdio: "pipe",
    });
    onLog?.("Installing dependencies...");
    execSync("yarn install", { cwd: appDir, stdio: "pipe", timeout: 180_000 });
    onLog?.("Template ready.");
    return { phase: "scaffold", status: "success", iterations: 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { phase: "scaffold", status: "failed", iterations: 0, error: message.slice(0, 200) };
  }
}

export function commitAfterPhase(outDir: string, phase: Phase): void {
  const appDir = join(outDir, "app");
  if (!existsSync(join(appDir, ".git"))) return;

  try {
    const status = execSync("git status --porcelain", {
      cwd: appDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (!status.trim()) return;

    execSync("git add -A", { cwd: appDir, stdio: ["pipe", "pipe", "pipe"] });
    execSync(`git commit -m "harness: complete phase ${phase}"`, {
      cwd: appDir,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    // non-fatal: commits are diagnostic snapshots only.
  }
}

export function writeHarnessReports(input: {
  state: SessionState;
  harness: HarnessConfig;
  brand: HarnessInput["brand"];
  mode: string;
  totalCost: number;
  phaseCosts?: Map<string, number> | Map<Phase, number>;
}): void {
  if (input.state.config.platforms.includes("firetv-vega")) {
    writeVegaReport({
      outDir: input.state.workdir,
      checks: [],
      budgets: input.harness.vega,
      phaseResults: input.state.phaseResults,
    });
  }

  writeRunReport({
    outDir: input.state.workdir,
    runId: input.state.runId,
    mode: input.mode,
    platforms: input.state.config.platforms,
    templateRepo: input.harness.template.repo,
    tokensUsed: input.state.tokensUsed,
    tokenBudget: input.state.tokenBudget,
    totalCost: input.totalCost,
    phaseResults: input.state.phaseResults,
    phaseCosts: input.phaseCosts,
    spec: input.state.spec,
    brand: input.brand,
  });
}

export function writeSpec(outDir: string, spec: unknown): void {
  writeFileSync(join(outDir, "spec.json"), JSON.stringify(spec, null, 2));
}
