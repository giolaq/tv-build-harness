import type { PhaseResult } from "./types.js";
import type { PhaseSpec } from "./harness-config.js";

export interface PipelineHooks {
  onPhaseStart?: (spec: PhaseSpec) => void;
  onPhaseEnd?: (spec: PhaseSpec, result: PhaseResult) => void;
  // Called after a phase fully succeeds (commit, checkpoint, ...).
  onPhaseSuccess?: (spec: PhaseSpec) => void;
  onPhaseSkipped?: (spec: PhaseSpec) => void;
  onRetry?: (spec: PhaseSpec, attempt: number, maxRetries: number, result: PhaseResult) => void;
  onLog?: (message: string) => void;
  // Checked between phases; return a reason string to stop the pipeline early.
  shouldStop?: () => string | null;
}

export interface PipelineOptions {
  phases: PhaseSpec[];
  executor: (spec: PhaseSpec, attempt: number) => Promise<PhaseResult>;
  maxRetries: number;
  // Phases already done in a previous run (resume) — skipped, treated as successful deps.
  completed?: Set<string>;
  hooks?: PipelineHooks;
}

/**
 * The deterministic core of the harness: iterates phases in order, blocks
 * phases whose dependencies failed, retries failures with the executor,
 * aborts on load-bearing phase failure, and supports resume via `completed`.
 *
 * The executor is the only stochastic part — everything here is plain control
 * flow, which is what makes it testable without a model.
 */
export async function runPipeline(opts: PipelineOptions): Promise<Map<string, PhaseResult>> {
  const { phases, executor, maxRetries, hooks = {} } = opts;
  const results = new Map<string, PhaseResult>();
  const completed = new Set<string>(opts.completed ?? []);
  const failed = new Set<string>();
  const activeNames = new Set(phases.map((p) => p.name));

  for (const spec of phases) {
    if (completed.has(spec.name)) {
      const skipped: PhaseResult = { phase: spec.name, status: "success", iterations: 0 };
      results.set(spec.name, skipped);
      hooks.onPhaseSkipped?.(spec);
      continue;
    }

    const stopReason = hooks.shouldStop?.() ?? null;
    if (stopReason) {
      hooks.onLog?.(`Stopping pipeline: ${stopReason}`);
      break;
    }

    const blockedBy = spec.deps.find((dep) => activeNames.has(dep) && failed.has(dep));
    if (blockedBy) {
      failed.add(spec.name);
      const blocked: PhaseResult = {
        phase: spec.name,
        status: "failed",
        iterations: 0,
        error: `Blocked by failed dependency: ${blockedBy}`,
      };
      results.set(spec.name, blocked);
      hooks.onPhaseEnd?.(spec, blocked);
      continue;
    }

    hooks.onPhaseStart?.(spec);
    const result = await executePhaseWithRetry(spec, executor, maxRetries, hooks);
    results.set(spec.name, result);
    hooks.onPhaseEnd?.(spec, result);

    if (result.status === "failed") {
      failed.add(spec.name);
      if (spec.abortOnFailure) {
        hooks.onLog?.(`Aborting: phase "${spec.name}" is load-bearing and failed.`);
        break;
      }
    } else {
      completed.add(spec.name);
      if (result.status === "success") {
        hooks.onPhaseSuccess?.(spec);
      }
    }
  }

  return results;
}

async function executePhaseWithRetry(
  spec: PhaseSpec,
  executor: PipelineOptions["executor"],
  maxRetries: number,
  hooks: PipelineHooks
): Promise<PhaseResult> {
  if (spec.internalLoop) {
    return executor(spec, 1);
  }

  const retries = spec.retries ?? maxRetries;

  let last: PhaseResult = { phase: spec.name, status: "failed", iterations: 0, error: "Exhausted retries" };
  for (let attempt = 1; attempt <= retries; attempt++) {
    last = await executor(spec, attempt);

    if (last.status === "success") return last;

    if (attempt < retries) {
      hooks.onRetry?.(spec, attempt, retries, last);
    }
  }

  return last;
}

/**
 * Filters the configured pipeline down to the phases active for this run and
 * resolves which of them count as already completed.
 *
 * Completion policy lives here so every orchestrator shares it:
 * - `resumedPhases` (from a checkpoint) are skipped.
 * - `fromPhase` means "redo from here": only phases *before* it count as
 *   completed, even when the checkpoint already includes later ones.
 */
export function selectActivePhases(
  phases: PhaseSpec[],
  opts: {
    platforms: string[];
    generateOnly?: boolean;
    fromPhase?: string;
    resumedPhases?: Set<string>;
  }
): { active: PhaseSpec[]; completed: Set<string> } {
  const active = phases.filter((spec) => {
    if (opts.generateOnly && spec.buildPhase) return false;
    if (spec.requiresPlatform && !opts.platforms.includes(spec.requiresPlatform)) return false;
    return true;
  });

  if (opts.fromPhase) {
    const idx = active.findIndex((p) => p.name === opts.fromPhase);
    if (idx === -1) {
      throw new Error(
        `--from-phase "${opts.fromPhase}" is not in the active pipeline. Active phases: ${active.map((p) => p.name).join(", ")}`
      );
    }
    return { active, completed: new Set(active.slice(0, idx).map((p) => p.name)) };
  }

  const activeNames = new Set(active.map((p) => p.name));
  const completed = new Set([...(opts.resumedPhases ?? [])].filter((name) => activeNames.has(name)));
  return { active, completed };
}
