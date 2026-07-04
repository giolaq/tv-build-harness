import { join } from "node:path";
import type {
  Phase,
  PhaseResult,
  SessionState,
  HarnessInput,
} from "../types.js";
import { SkillLibrary } from "../skill-library.js";
import { RunLog } from "../run-log.js";
import { PromptLoader } from "../prompt-loader.js";
import type { HarnessConfig } from "../harness-config.js";
import { runPipeline, selectActivePhases } from "../pipeline-engine.js";
import { saveCheckpoint, loadCheckpoint } from "../checkpoint.js";
import {
  budgetStopReason,
  createPromptLoader,
  createRunContext,
  loadSpecIfPresent,
} from "../run-context.js";
import { ClaudePhaseExecutor } from "../claude-phase-executor.js";

export interface RunOptions {
  generateOnly?: boolean;
  fromPhase?: string;
}

export interface ClaudeOrchestratorOptions {
  record?: boolean;
}

export interface PhaseMessage {
  type: "text" | "tool_use" | "tool_result";
  content: string;
  toolName?: string;
}

export interface HarnessEvents {
  onPhaseStart?: (phase: Phase) => void;
  onPhaseEnd?: (phase: Phase, result: PhaseResult, cost?: number) => void;
  onTokens?: (tokens: number) => void;
  onIteration?: (phase: Phase, current: number, max: number) => void;
  onLog?: (message: string) => void;
  onPhaseMessage?: (phase: Phase, message: PhaseMessage) => void;
}

export class ClaudeOrchestrator {
  private state: SessionState;
  private skills: SkillLibrary;
  private log: RunLog;
  private input: HarnessInput;
  private events: HarnessEvents;
  private harness: HarnessConfig;
  private prompts: PromptLoader;
  private executor: ClaudePhaseExecutor;
  private options: ClaudeOrchestratorOptions;
  private resumedPhases: Set<string> = new Set();
  // Resolved by the engine at run start; checkpoints are built from this.
  private effectiveCompleted: Set<string> = new Set();

  constructor(input: HarnessInput, events: HarnessEvents = {}, options: ClaudeOrchestratorOptions = {}) {
    this.skills = new SkillLibrary(input.skillsDir);
    this.input = input;
    this.events = events;
    this.options = options;
    this.prompts = createPromptLoader(input);

    const ctx = createRunContext(input);
    this.harness = ctx.harness;
    this.log = ctx.log;
    this.state = ctx.state;
    this.executor = new ClaudePhaseExecutor({
      state: this.state,
      input: this.input,
      events: this.events,
      harness: this.harness,
      log: this.log,
      skills: this.skills,
      prompts: this.prompts,
      record: this.options.record,
    });
  }

  static fromExistingRun(outDir: string, input: HarnessInput, events: HarnessEvents = {}, options: ClaudeOrchestratorOptions = {}): ClaudeOrchestrator {
    const instance = new ClaudeOrchestrator(input, events, options);
    instance.state.workdir = outDir;
    instance.state.runId = outDir.split("/").pop() ?? "rerun";

    loadSpecIfPresent(instance.state, outDir);

    instance.log = new RunLog(join(outDir, "run.log"));
    instance.executor = new ClaudePhaseExecutor({
      state: instance.state,
      input: instance.input,
      events: instance.events,
      harness: instance.harness,
      log: instance.log,
      skills: instance.skills,
      prompts: instance.prompts,
      record: instance.options.record,
    });
    return instance;
  }

  /** Resumes a previous run from its checkpoint, skipping completed phases. */
  static resume(outDir: string, input: HarnessInput, events: HarnessEvents = {}, options: ClaudeOrchestratorOptions = {}): ClaudeOrchestrator {
    const instance = ClaudeOrchestrator.fromExistingRun(outDir, input, events, options);
    const checkpoint = loadCheckpoint(outDir);
    if (checkpoint) {
      instance.resumedPhases = new Set(checkpoint.completedPhases);
      instance.state.runId = checkpoint.runId;
      if (checkpoint.creativeSeed) {
        instance.state.creativeSeed = checkpoint.creativeSeed;
        instance.input.creativeSeed = checkpoint.creativeSeed;
      }
    }
    return instance;
  }

  getResumedPhases(): Set<string> {
    return this.resumedPhases;
  }

  async runVisualQAOnly(): Promise<PhaseResult> {
    this.state.currentPhase = "visual_qa_loop";
    this.events.onPhaseStart?.("visual_qa_loop");
    const result = await this.executor.executeVisualQALoop();
    this.events.onPhaseEnd?.("visual_qa_loop", result, this.executor.finishPhaseCost("visual_qa_loop"));
    return result;
  }

  async run(options: RunOptions = {}): Promise<{ state: SessionState; outDir: string }> {
    const { active, completed } = selectActivePhases(this.harness.phases, {
      platforms: this.state.config.platforms,
      generateOnly: options.generateOnly,
      fromPhase: options.fromPhase,
      resumedPhases: this.resumedPhases,
    });

    // The engine's resolved completion set is also what checkpoints build on —
    // under --from-phase it deliberately excludes the phases being redone.
    this.effectiveCompleted = completed;

    const results = await runPipeline({
      phases: active,
      maxRetries: this.state.config.max_retries_per_phase,
      completed,
      executor: (spec) => this.executor.executePhase(spec),
      hooks: {
        onPhaseStart: (spec) => {
          this.state.currentPhase = spec.name;
          this.log.phaseStart(spec.name, this.state.totalIterations);
          this.events.onPhaseStart?.(spec.name);
          if (!this.events.onLog) {
            console.log(`\n  [${"=".repeat(40)}]`);
            console.log(`  Phase: ${spec.name}`);
            console.log(`  [${"=".repeat(40)}]\n`);
          }
        },
        onPhaseEnd: (spec, result) => {
          this.state.phaseResults.set(spec.name, result);
          this.log.phaseEnd(spec.name, this.state.totalIterations, result.status);
          const phaseCost = this.executor.finishPhaseCost(spec.name);
          this.events.onPhaseEnd?.(spec.name, result, phaseCost);
          if (result.status === "aborted") this.checkpoint();

          const label = result.status === "failed" ? "FAILED" : result.status === "degraded" ? "DEGRADED" : result.status;
          const detail = result.error ? `: ${result.error}` : "";
          if (!this.events.onLog) console.log(`  Phase ${spec.name} ${label}${detail}`);
          this.events.onLog?.(`Phase ${spec.name} ${label}${detail}`);
        },
        onPhaseSuccess: (spec) => {
          this.executor.commitAfterPhase(spec.name);
          this.checkpoint();
        },
        onPhaseSkipped: (spec) => {
          const skipped: PhaseResult = { phase: spec.name, status: "success", iterations: 0 };
          this.state.phaseResults.set(spec.name, skipped);
          // Surface to the UI too, or skipped phases sit "pending" forever in the TUI.
          this.events.onPhaseEnd?.(spec.name, skipped, 0);
          this.events.onLog?.(`Phase ${spec.name} skipped (already completed)`);
        },
        onRetry: (spec, attempt, max, result) => {
          const msg = `Attempt ${attempt}/${max} ${result.status}: ${result.error}. Retrying...`;
          if (!this.events.onLog) console.log(`  ${msg}`);
          this.events.onLog?.(msg);
        },
        onLog: (msg) => {
          if (!this.events.onLog) console.log(`  ${msg}`);
          this.events.onLog?.(msg);
        },
        shouldStop: () =>
          budgetStopReason(this.state) ??
          (this.state.tokensUsed >= this.state.tokenBudget
            ? `Token budget exhausted (${this.state.tokensUsed}/${this.state.tokenBudget})`
            : null),
      },
    });

    for (const [name, result] of results) {
      this.state.phaseResults.set(name, result);
    }

    this.executor.writeReport();
    this.executor.checkSkillPromotions();
    return { state: this.state, outDir: this.state.workdir };
  }

  private checkpoint(): void {
    const completedPhases = [...this.effectiveCompleted];
    for (const [name, result] of this.state.phaseResults) {
      if ((result.status === "success" || result.status === "degraded") && !completedPhases.includes(name)) {
        completedPhases.push(name);
      }
    }
    saveCheckpoint(this.state.workdir, {
      runId: this.state.runId,
      creativeSeed: this.state.creativeSeed,
      abortReason: this.state.abortReason,
      completedPhases,
    });
  }

  getState(): SessionState {
    return this.state;
  }
}
