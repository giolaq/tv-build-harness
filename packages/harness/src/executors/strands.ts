import type {
  SessionState,
  HarnessInput,
} from "../types.js";
import { RunLog } from "../run-log.js";
import type { HarnessConfig } from "../harness-config.js";
import { runPipeline, selectActivePhases } from "../pipeline-engine.js";
import type { ModelProviderConfig } from "../model-factory.js";
import { PromptLoader } from "../prompt-loader.js";
import type { HarnessEvents } from "./claude-cli.js";
import {
  createPromptLoader,
  createRunContext,
  budgetStopReason,
} from "../run-context.js";
import { StrandsPhaseExecutor } from "../strands-phase-executor.js";

export interface StrandsRunOptions {
  generateOnly?: boolean;
}

export class StrandsOrchestrator {
  private state: SessionState;
  private log: RunLog;
  private input: HarnessInput;
  private events: HarnessEvents;
  private harness: HarnessConfig;
  private modelConfig: ModelProviderConfig;
  private prompts: PromptLoader;
  private executor: StrandsPhaseExecutor;

  constructor(input: HarnessInput, events: HarnessEvents = {}) {
    this.input = input;
    this.events = events;
    this.prompts = createPromptLoader(input);

    const ctx = createRunContext(input, { tokenBudget: 0 });
    this.harness = ctx.harness;
    this.log = ctx.log;
    this.state = ctx.state;

    if (this.harness.models.strandsProvider) {
      this.modelConfig = this.harness.models.strandsProvider;
    } else {
      this.modelConfig = {
        provider: "anthropic",
        modelId: this.harness.models.execution,
        maxTokens: 8192,
      };
    }
    this.executor = new StrandsPhaseExecutor({
      state: this.state,
      input: this.input,
      events: this.events,
      harness: this.harness,
      log: this.log,
      prompts: this.prompts,
      modelConfig: this.modelConfig,
    });
  }

  async run(options: StrandsRunOptions = {}): Promise<{ state: SessionState; outDir: string }> {
    const { active } = selectActivePhases(this.harness.phases, {
      platforms: this.state.config.platforms,
      generateOnly: options.generateOnly,
    });

    const results = await runPipeline({
      phases: active,
      maxRetries: 1,
      executor: (spec) => this.executor.executePhase(spec),
      hooks: {
        onPhaseStart: (spec) => {
          this.state.currentPhase = spec.name;
          this.log.phaseStart(spec.name, this.state.totalIterations);
          this.events.onPhaseStart?.(spec.name);
        },
        onPhaseEnd: (spec, result) => {
          this.state.phaseResults.set(spec.name, result);
          this.log.phaseEnd(spec.name, this.state.totalIterations, result.status);
          this.events.onPhaseEnd?.(spec.name, result, this.executor.getPhaseCost(spec.name));
        },
        onLog: (msg) => {
          this.events.onLog?.(msg);
        },
        shouldStop: () =>
          budgetStopReason(this.state) ??
          (this.state.tokenBudget > 0 && this.state.tokensUsed >= this.state.tokenBudget
            ? `Token budget exhausted (${this.state.tokensUsed}/${this.state.tokenBudget})`
            : null),
      },
    });

    for (const [name, result] of results) {
      this.state.phaseResults.set(name, result);
    }

    this.executor.writeReport();
    return { state: this.state, outDir: this.state.workdir };
  }

  getState(): SessionState {
    return this.state;
  }
}
