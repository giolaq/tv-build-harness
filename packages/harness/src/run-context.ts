import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
  const runId = input.runId ?? randomUUID().slice(0, 8);
  const creativeSeed = normalizeCreativeSeed(input.creativeSeed);
  input.creativeSeed = creativeSeed;
  const outDir = join(input.workdir, "out", runId);
  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(outDir, "screenshots"), { recursive: true });
  writeRunInput(outDir, input, harness);

  return {
    harness,
    log: new RunLog(join(outDir, "run.log")),
    state: {
      runId,
      workdir: outDir,
      creativeSeed,
      config: input.config,
      spec: null,
      currentPhase: "plan",
      phaseResults: new Map(),
      iteration: 0,
      totalIterations: 0,
      tokenBudget: options.tokenBudget ?? harness.tokenBudget,
      tokensUsed: 0,
      costSoFar: 0,
      maxCostUsd: input.maxCostUsd ?? harness.maxCostUsd,
      messages: [],
    },
  };
}

export function createPromptLoader(input: HarnessInput): PromptLoader {
  const moduleDir = typeof import.meta.dirname === "string"
    ? import.meta.dirname
    : dirname(fileURLToPath(import.meta.url));
  const builtinPrompts = join(moduleDir, "..", "prompts");
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
    execFileSync("git", ["clone", harness.template.repo, appDir], { stdio: "pipe", timeout: 60_000 });
    execFileSync("git", ["checkout", "--detach", harness.template.commit], { cwd: appDir, stdio: "pipe", timeout: 60_000 });
    rmSync(join(appDir, ".git"), { recursive: true, force: true });
    execFileSync("git", ["init"], { cwd: appDir, stdio: "pipe" });
    execFileSync("git", ["add", "-A"], { cwd: appDir, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", "initial template"], { cwd: appDir, stdio: "pipe" });
    onLog?.("Installing dependencies...");
    execFileSync("yarn", ["install"], { cwd: appDir, stdio: "pipe", timeout: 180_000 });
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
    writeAppOriginMarker(outDir);
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: appDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (!status.trim()) return;

    execFileSync("git", ["add", "-A"], { cwd: appDir, stdio: ["pipe", "pipe", "pipe"] });
    execFileSync("git", ["commit", "-m", `harness: complete phase ${phase}`], {
      cwd: appDir,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    // non-fatal: commits are diagnostic snapshots only.
  }
}

export function writeAppOriginMarker(outDir: string): void {
  const appDir = join(outDir, "app");
  mkdirSync(join(appDir, ".tv-build"), { recursive: true });
  const runId = outDir.split("/").pop() ?? "unknown";
  const specPath = join(outDir, "spec.json");
  let creativeSeed: string | undefined;
  if (existsSync(specPath)) {
    try {
      const spec = JSON.parse(readFileSync(specPath, "utf-8")) as { creative_seed?: string };
      creativeSeed = spec.creative_seed;
    } catch {
      creativeSeed = undefined;
    }
  }
  const markerPath = join(appDir, ".tv-build", "run.json");
  let createdAt = new Date().toISOString();
  if (existsSync(markerPath)) {
    try {
      const existing = JSON.parse(readFileSync(markerPath, "utf-8")) as { createdAt?: string };
      createdAt = existing.createdAt ?? createdAt;
    } catch {
      // Keep the fresh timestamp when the marker is corrupt.
    }
  }
  const next = JSON.stringify({
    runId,
    outDir,
    specPath,
    creativeSeed,
    createdAt,
  }, null, 2);
  if (!existsSync(markerPath) || readFileSync(markerPath, "utf-8") !== next) {
    writeFileSync(markerPath, next);
  }
}

function writeRunInput(outDir: string, input: HarnessInput, harness: HarnessConfig): void {
  writeFileSync(join(outDir, "input.json"), JSON.stringify({
    prompt: input.prompt,
    creativeSeed: input.creativeSeed,
    maxCostUsd: input.maxCostUsd,
    content: input.content,
    brand: input.brand,
    config: input.config,
    design: input.design,
    screenTree: input.screenTree,
    harness,
  }, null, 2));
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
    creativeSeed: input.state.creativeSeed,
    mode: input.mode,
    platforms: input.state.config.platforms,
    templateRepo: input.harness.template.repo,
    tokensUsed: input.state.tokensUsed,
    tokenBudget: input.state.tokenBudget,
    totalCost: input.totalCost,
    maxCostUsd: input.state.maxCostUsd,
    phaseResults: input.state.phaseResults,
    phaseCosts: input.phaseCosts,
    spec: input.state.spec,
    brand: input.brand,
  });
}

export function writeSpec(outDir: string, spec: unknown, creativeSeed?: string): void {
  const withSeed = creativeSeed && spec && typeof spec === "object"
    ? { ...(spec as Record<string, unknown>), creative_seed: creativeSeed }
    : spec;
  writeFileSync(join(outDir, "spec.json"), JSON.stringify(withSeed, null, 2));
}

function normalizeCreativeSeed(seed: string | undefined): string {
  const trimmed = seed?.trim();
  return trimmed || randomUUID().slice(0, 12);
}

export class BudgetAbortError extends Error {
  reason = "budget" as const;

  constructor(message: string) {
    super(message);
    this.name = "BudgetAbortError";
  }
}

export function bookCost(state: SessionState, costUsd: number): void {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return;
  state.costSoFar += costUsd;
  if (state.maxCostUsd !== undefined && state.costSoFar > state.maxCostUsd) {
    state.abortReason = "budget";
    throw new BudgetAbortError(`Cost budget exceeded: $${state.costSoFar.toFixed(4)} > $${state.maxCostUsd.toFixed(4)}`);
  }
}

export function budgetStopReason(state: SessionState): string | null {
  if (state.abortReason === "budget") {
    return `Cost budget exceeded ($${state.costSoFar.toFixed(4)}/${state.maxCostUsd?.toFixed(4) ?? "unknown"})`;
  }
  return null;
}

export function isBudgetAbort(err: unknown): err is BudgetAbortError {
  return err instanceof BudgetAbortError;
}
