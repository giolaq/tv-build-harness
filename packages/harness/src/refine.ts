import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { HarnessConfig, PhaseSpec, VerifyCheck } from "./harness-config.js";
import { AppSpecSchema, BrandKitSchema, ContentManifestSchema, DesignTokensSchema, RunConfigSchema } from "./types.js";
import type { AppSpec, HarnessInput, Phase, PhaseResult, SessionState } from "./types.js";
import { RunLog } from "./run-log.js";
import { SkillLibrary } from "./skill-library.js";
import { PromptLoader } from "./prompt-loader.js";
import { runPipeline } from "./pipeline-engine.js";
import { budgetStopReason, createPromptLoader, writeAppOriginMarker } from "./run-context.js";
import { getPhaseInstructions, promptContext } from "./phase-context.js";
import { ClaudePhaseExecutor } from "./claude-phase-executor.js";
import { writeEvent } from "./output.js";

export interface RefineTarget {
  runId: string;
  outDir: string;
  appDir: string;
  spec: AppSpec;
  source: "runId" | "appDir" | "outDir";
}

export interface RefinePlan {
  command: "refine_plan";
  runId: string;
  outDir: string;
  appDir: string;
  phase: Phase;
  inferredPhase: boolean;
  instruction: string;
  seed: string;
  verify: VerifyCheck[];
  maxCostUsd: number;
  nonGoal: string;
}

export interface RefineResult {
  status: "success" | "failed" | "aborted";
  runId: string;
  outDir: string;
  appDir: string;
  phase: Phase;
  instruction: string;
  costUsd: number;
  result: PhaseResult;
  error?: string;
}

export interface RefineOptions {
  target: string;
  phase?: string;
  instruction: string;
  rootDir?: string;
  skillsDir: string;
  maxCostUsd?: number;
  json?: boolean;
  yes?: boolean;
  executor?: RefineExecutor;
}

export type RefineExecutor = (input: {
  phase: PhaseSpec;
  prompt: string;
  target: RefineTarget;
  harnessInput: HarnessInput;
  harness: HarnessConfig;
  maxCostUsd: number;
  events?: RefineEvents;
}) => Promise<{ result: PhaseResult; costUsd: number }>;

export interface RefineEvents {
  onPhaseStart?: (phase: Phase) => void;
  onPhaseEnd?: (phase: Phase, result: PhaseResult, cost?: number) => void;
  onRetry?: (phase: Phase, attempt: number, max: number, result: PhaseResult) => void;
  onLog?: (message: string) => void;
}

export function resolveRefineTarget(targetArg: string, rootDir = process.cwd()): RefineTarget {
  const root = resolve(rootDir);
  const asRunDir = join(root, "out", targetArg);
  if (existsSync(join(asRunDir, "spec.json"))) {
    return targetFromOutDir(asRunDir, "runId");
  }

  const targetPath = resolve(root, targetArg);
  if (existsSync(join(targetPath, "spec.json")) && existsSync(join(targetPath, "app"))) {
    return targetFromOutDir(targetPath, "outDir");
  }

  const appDir = existsSync(join(targetPath, "package.json")) ? targetPath : resolve(targetArg);
  if (existsSync(join(appDir, "package.json"))) {
    const markerPath = join(appDir, ".tv-build", "run.json");
    if (existsSync(markerPath)) {
      const marker = JSON.parse(readFileSync(markerPath, "utf-8")) as { runId?: string; outDir?: string; specPath?: string };
      const outDir = marker.outDir ? resolve(marker.outDir) : dirname(dirname(marker.specPath ?? ""));
      if (marker.runId && existsSync(join(outDir, "spec.json"))) {
        return targetFromOutDir(outDir, "appDir", appDir);
      }
    }

    const maybeOutDir = dirname(appDir);
    if (basename(appDir) === "app" && existsSync(join(maybeOutDir, "spec.json"))) {
      return targetFromOutDir(maybeOutDir, "appDir", appDir);
    }
  }

  throw new RefineInputError(
    "refine_target_not_found",
    `Could not resolve refine target "${targetArg}".`,
    "Pass a run id under ./out, an out/<runId> directory, or an app directory containing .tv-build/run.json."
  );
}

export function buildRefinePlan(options: RefineOptions): RefinePlan {
  const rootDir = options.rootDir ?? process.cwd();
  const target = resolveRefineTarget(options.target, rootDir);
  const { harnessInput, harness } = loadRefineInput(target, options.skillsDir, options.maxCostUsd);
  const { phase, inferred } = resolvePhase(options.phase, options.instruction, harness);
  const phaseSpec = phaseSpecFor(phase, harness);

  return {
    command: "refine_plan",
    runId: target.runId,
    outDir: target.outDir,
    appDir: target.appDir,
    phase,
    inferredPhase: inferred,
    instruction: options.instruction,
    seed: harnessInput.creativeSeed ?? target.spec.creative_seed ?? "unknown",
    verify: phaseSpec.verify,
    maxCostUsd: options.maxCostUsd ?? 3,
    nonGoal: "refine amends the current app state; it does not rewind to the phase commit or replay downstream phases.",
  };
}

export function buildRefineInstructions(input: {
  phaseSpec: PhaseSpec;
  instruction: string;
  target: RefineTarget;
  harnessInput: HarnessInput;
  harness: HarnessConfig;
  prompts: PromptLoader;
}): string {
  const state = refineState(input.target, input.harnessInput, input.harness, input.target.spec);
  const original = getPhaseInstructions(input.phaseSpec, promptContext({
    outDir: input.target.outDir,
    input: input.harnessInput,
    state,
    harness: input.harness,
    prompts: input.prompts,
  })) ?? `Execute phase concern: ${input.phaseSpec.name}`;

  return [
    "## Refine Mode",
    "",
    "You are making a targeted amendment to the app's CURRENT state.",
    "Do not reset, rewind, regenerate the app, or replay downstream phases.",
    "Read current files first, modify in place, and preserve unrelated developer work.",
    `App directory: ${input.target.appDir}`,
    `Originating run: ${input.target.runId}`,
    `Creative seed: ${input.harnessInput.creativeSeed ?? input.target.spec.creative_seed ?? "unknown"}`,
    "",
    "## Original Phase Concern",
    "",
    original,
    "",
    "## Developer Instruction",
    "",
    input.instruction,
    "",
    "## Verification Gate",
    "",
    "After editing, the original phase verification checks will run again. Keep the app scoped to this phase's concern and fix any failures before finishing.",
  ].join("\n");
}

export async function executeRefine(options: RefineOptions): Promise<RefineResult> {
  const plan = buildRefinePlan(options);
  if (options.json && !options.yes) {
    throw new RefineInputError(
      "confirmation_required",
      "JSON refine execution requires --yes.",
      "Show the human `tv-build refine <target> --phase <phase> \"instruction\" --plan --json`, then rerun with --yes."
    );
  }

  const target = resolveRefineTarget(options.target, options.rootDir);
  const { harnessInput, harness } = loadRefineInput(target, options.skillsDir, plan.maxCostUsd);
  const phaseSpec = { ...phaseSpecFor(plan.phase, harness), retries: 2, internalLoop: false };
  const prompts = createPromptLoader({ ...harnessInput, workdir: target.outDir });
  const prompt = buildRefineInstructions({ phaseSpec, instruction: options.instruction, target, harnessInput, harness, prompts });
  const executor = options.executor ?? defaultClaudeRefineExecutor;

  const guard = createGuardBranch(target.appDir, plan.phase);
  let outcome: { result: PhaseResult; costUsd: number } | null = null;
  try {
    options.json && writeEvent("phase_start", { phase: plan.phase, refine: true, runId: plan.runId });
    outcome = await executor({
      phase: phaseSpec,
      prompt,
      target,
      harnessInput,
      harness,
      maxCostUsd: plan.maxCostUsd,
      events: options.json ? {
        onRetry: (phase, attempt, max, result) => {
          writeEvent("verify_failed", { phase, refine: true, error: result.error });
          writeEvent("retry", { phase, refine: true, attempt, max, result });
        },
        onLog: (message) => console.error(message),
      } : undefined,
    });

    if (outcome.result.status === "aborted") {
      throw new RefineRunError("aborted", outcome.result.error ?? "Refine aborted.");
    }
    if (outcome.result.status !== "success") {
      throw new RefineRunError("failed", outcome.result.error ?? "Refine failed verification.");
    }

    const commit = commitRefine(target.appDir, plan.phase, options.instruction);
    mergeGuardBranch(target.appDir, guard);
    appendRefineReport(target.outDir, {
      phase: plan.phase,
      instruction: options.instruction,
      costUsd: outcome.costUsd,
      checks: phaseSpec.verify,
      commit,
    });
    options.json && writeEvent("phase_complete", { phase: plan.phase, refine: true, result: outcome.result, cost: outcome.costUsd });
    options.json && writeEvent("run_complete", {
      runId: plan.runId,
      outDir: target.outDir,
      seed: plan.seed,
      status: "success",
      costSoFar: outcome.costUsd,
      budget: plan.maxCostUsd,
      phases: [outcome.result],
    });
    return { status: "success", runId: plan.runId, outDir: target.outDir, appDir: target.appDir, phase: plan.phase, instruction: options.instruction, costUsd: outcome.costUsd, result: outcome.result };
  } catch (err) {
    cleanupGuardBranch(target.appDir, guard);
    const error = err instanceof Error ? err.message : String(err);
    const status = err instanceof RefineRunError && err.kind === "aborted" ? "aborted" : "failed";
    const result = outcome?.result ?? { phase: plan.phase, status: status === "aborted" ? "aborted" : "failed", iterations: 0, error };
    options.json && writeEvent("run_complete", {
      runId: plan.runId,
      outDir: target.outDir,
      seed: plan.seed,
      status,
      costSoFar: outcome?.costUsd ?? 0,
      budget: plan.maxCostUsd,
      reason: status === "aborted" ? "budget" : undefined,
      phases: [result],
    });
    return { status, runId: plan.runId, outDir: target.outDir, appDir: target.appDir, phase: plan.phase, instruction: options.instruction, costUsd: outcome?.costUsd ?? 0, result, error };
  }
}

export class RefineInputError extends Error {
  constructor(public code: string, message: string, public hint: string) {
    super(message);
    this.name = "RefineInputError";
  }
}

class RefineRunError extends Error {
  constructor(public kind: "failed" | "aborted", message: string) {
    super(message);
    this.name = "RefineRunError";
  }
}

function targetFromOutDir(outDir: string, source: RefineTarget["source"], appDir = join(outDir, "app")): RefineTarget {
  if (!existsSync(join(appDir, "package.json"))) {
    throw new RefineInputError("refine_app_not_found", `No generated app found at ${appDir}.`, "Run a generation first or pass the generated app directory.");
  }
  const raw = JSON.parse(readFileSync(join(outDir, "spec.json"), "utf-8"));
  const spec = AppSpecSchema.parse(raw);
  return {
    runId: basename(outDir),
    outDir: resolve(outDir),
    appDir: resolve(appDir),
    spec,
    source,
  };
}

function loadRefineInput(target: RefineTarget, skillsDir: string, maxCostUsd?: number): { harnessInput: HarnessInput; harness: HarnessConfig } {
  const inputPath = join(target.outDir, "input.json");
  if (!existsSync(inputPath)) {
    throw new RefineInputError(
      "missing_run_input",
      `Run input snapshot not found at ${inputPath}.`,
      "Use refine on runs created after v0.3.0, or do a full rerun with edited inputs."
    );
  }
  const raw = JSON.parse(readFileSync(inputPath, "utf-8")) as Record<string, unknown>;
  const harness = raw.harness as HarnessConfig;
  if (!harness?.phases) {
    throw new RefineInputError("missing_harness_config", "Run input snapshot does not include harness phases.", "Rerun the app with the current harness, then refine that run.");
  }

  const creativeSeed = String(raw.creativeSeed ?? target.spec.creative_seed ?? "");
  const harnessInput: HarnessInput = {
    prompt: String(raw.prompt ?? ""),
    creativeSeed,
    maxCostUsd: maxCostUsd ?? 3,
    content: ContentManifestSchema.parse(raw.content),
    brand: BrandKitSchema.parse(raw.brand),
    config: RunConfigSchema.parse(raw.config),
    design: DesignTokensSchema.parse(raw.design),
    screenTree: raw.screenTree as HarnessInput["screenTree"],
    workdir: target.outDir,
    skillsDir,
    harness,
  };
  return { harnessInput, harness };
}

function resolvePhase(explicit: string | undefined, instruction: string, harness: HarnessConfig): { phase: Phase; inferred: boolean } {
  if (explicit) return { phase: explicit, inferred: false };
  const lower = instruction.toLowerCase();
  const scored = [
    ["branding", ["brand", "palette", "color", "warmer", "cooler", "logo", "font"]],
    ["creative_ui", ["hero", "card", "motion", "focus", "animation", "layout", "visual", "atmosphere"]],
    ["content", ["content", "copy", "metadata", "rail", "category", "title"]],
    ["navigation", ["nav", "menu", "drawer", "tab", "route", "focus order"]],
    ["screens", ["screen", "detail", "grid", "home"]],
    ["verify", ["typescript", "tsc", "focus check", "build error"]],
  ] as const;
  const hit = scored
    .map(([phase, words]) => ({ phase, score: words.filter((word) => lower.includes(word)).length }))
    .sort((a, b) => b.score - a.score)[0];
  const inferred = hit && hit.score > 0 ? hit.phase : "creative_ui";
  phaseSpecFor(inferred, harness);
  return { phase: inferred, inferred: true };
}

function phaseSpecFor(phase: Phase, harness: HarnessConfig): PhaseSpec {
  const phaseSpec = harness.phases.find((item) => item.name === phase);
  if (!phaseSpec) {
    throw new RefineInputError(
      "unknown_refine_phase",
      `Phase "${phase}" is not in this run's harness config.`,
      `Choose one of: ${harness.phases.map((item) => item.name).join(", ")}.`
    );
  }
  if (phaseSpec.kind !== "agent") {
    throw new RefineInputError("unsupported_refine_phase", `Phase "${phase}" is not an agent phase.`, "Choose a prompt-driven phase such as branding, content, screens, creative_ui, or navigation.");
  }
  return phaseSpec;
}

async function defaultClaudeRefineExecutor(input: Parameters<RefineExecutor>[0]): Promise<{ result: PhaseResult; costUsd: number }> {
  const promptName = `refine-${input.phase.name}`;
  const promptDir = join(input.target.outDir, "prompts");
  mkdirSync(promptDir, { recursive: true });
  writeFileSync(join(promptDir, `${promptName}.md`), input.prompt);

  const phase: PhaseSpec = {
    ...input.phase,
    prompt: promptName,
    retries: 2,
    internalLoop: false,
    abortOnFailure: true,
  };
  const state = refineState(input.target, input.harnessInput, input.harness, input.target.spec);
  state.maxCostUsd = input.maxCostUsd;
  const log = new RunLog(join(input.target.outDir, "run.log"));
  const executor = new ClaudePhaseExecutor({
    state,
    input: input.harnessInput,
    events: {
      onLog: input.events?.onLog,
    },
    harness: input.harness,
    log,
    skills: new SkillLibrary(input.harnessInput.skillsDir),
    prompts: createPromptLoader({ ...input.harnessInput, workdir: input.target.outDir }),
    record: true,
  });

  const results = await runPipeline({
    phases: [phase],
    maxRetries: 2,
    executor: (spec) => executor.executePhase(spec),
    hooks: {
      onPhaseStart: (spec) => input.events?.onPhaseStart?.(spec.name),
      onPhaseEnd: (spec, result) => {
        state.phaseResults.set(spec.name, result);
        input.events?.onPhaseEnd?.(spec.name, result, executor.finishPhaseCost(spec.name));
      },
      onRetry: (spec, attempt, max, result) => input.events?.onRetry?.(spec.name, attempt, max, result),
      shouldStop: () => budgetStopReason(state),
    },
  });
  const result = results.get(phase.name) ?? { phase: phase.name, status: "failed", iterations: 0, error: "Refine did not return a result" };
  if (state.abortReason === "budget" && result.status !== "aborted") {
    return { result: { ...result, status: "aborted", error: "Cost budget exceeded" }, costUsd: state.costSoFar };
  }
  return { result, costUsd: state.costSoFar };
}

function refineState(target: RefineTarget, input: HarnessInput, harness: HarnessConfig, spec: AppSpec): SessionState {
  return {
    runId: target.runId,
    workdir: target.outDir,
    creativeSeed: input.creativeSeed ?? spec.creative_seed ?? randomUUID().slice(0, 12),
    config: input.config,
    spec,
    currentPhase: "plan",
    phaseResults: new Map(),
    iteration: 0,
    totalIterations: 0,
    tokenBudget: harness.tokenBudget,
    tokensUsed: 0,
    costSoFar: 0,
    maxCostUsd: input.maxCostUsd ?? 3,
    messages: [],
  };
}

function createGuardBranch(appDir: string, phase: Phase): { originalBranch: string; tempBranch: string } {
  if (!existsSync(join(appDir, ".git"))) {
    throw new RefineInputError("missing_app_git", `Generated app is not a git repository: ${appDir}`, "Run refine against an app generated by tv-build.");
  }
  const dirty = execSync("git status --porcelain", { cwd: appDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  if (dirty.trim()) {
    throw new RefineInputError("dirty_app_tree", "Generated app has uncommitted changes.", "Commit or stash app changes before running refine.");
  }
  const originalBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: appDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  if (originalBranch === "HEAD") {
    throw new RefineInputError("detached_app_head", "Generated app is on a detached HEAD.", "Switch the app repo to a branch before running refine.");
  }
  const tempBranch = `tv-build-refine-${phase}-${Date.now()}`;
  execFileSync("git", ["switch", "-c", tempBranch], { cwd: appDir, stdio: ["pipe", "pipe", "pipe"] });
  return { originalBranch, tempBranch };
}

function commitRefine(appDir: string, phase: Phase, instruction: string): string | null {
  writeAppOriginMarker(dirname(appDir));
  const dirty = execSync("git status --porcelain", { cwd: appDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  if (!dirty.trim()) return null;
  execFileSync("git", ["add", "-A"], { cwd: appDir, stdio: ["pipe", "pipe", "pipe"] });
  const summary = instruction.split(/\s+/).filter(Boolean).slice(0, 6).join(" ");
  execFileSync("git", ["commit", "-m", `refine(${phase}): ${summary}`], { cwd: appDir, stdio: ["pipe", "pipe", "pipe"] });
  return execSync("git rev-parse --short HEAD", { cwd: appDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function mergeGuardBranch(appDir: string, guard: { originalBranch: string; tempBranch: string }): void {
  execFileSync("git", ["switch", guard.originalBranch], { cwd: appDir, stdio: ["pipe", "pipe", "pipe"] });
  execFileSync("git", ["merge", "--ff-only", guard.tempBranch], { cwd: appDir, stdio: ["pipe", "pipe", "pipe"] });
  execFileSync("git", ["branch", "-D", guard.tempBranch], { cwd: appDir, stdio: ["pipe", "pipe", "pipe"] });
}

function cleanupGuardBranch(appDir: string, guard: { originalBranch: string; tempBranch: string }): void {
  try {
    execFileSync("git", ["reset", "--hard"], { cwd: appDir, stdio: ["pipe", "pipe", "pipe"] });
    execFileSync("git", ["clean", "-fd"], { cwd: appDir, stdio: ["pipe", "pipe", "pipe"] });
    execFileSync("git", ["switch", guard.originalBranch], { cwd: appDir, stdio: ["pipe", "pipe", "pipe"] });
    execFileSync("git", ["branch", "-D", guard.tempBranch], { cwd: appDir, stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    // Best-effort cleanup; caller reports the refine failure.
  }
}

function appendRefineReport(outDir: string, input: {
  phase: Phase;
  instruction: string;
  costUsd: number;
  checks: VerifyCheck[];
  commit: string | null;
}): void {
  const checks = input.checks.length === 0
    ? "none"
    : `${input.checks.length} passed`;
  appendFileSync(join(outDir, "report.md"), [
    "",
    "## Refines",
    "",
    `- **${new Date().toISOString()}** refine(${input.phase})`,
    `  - Instruction: ${input.instruction}`,
    `  - Cost: $${input.costUsd.toFixed(4)}`,
    `  - Checks: ${checks}`,
    `  - Commit: ${input.commit ?? "no app changes"}`,
    "",
  ].join("\n"));
}
