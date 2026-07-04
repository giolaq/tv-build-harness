import type {
  SessionState,
  HarnessInput,
} from "../types.js";
import { SkillLibrary } from "../skill-library.js";
import { RunLog } from "../run-log.js";
import type { HarnessConfig } from "../harness-config.js";
import { runPipeline, selectActivePhases } from "../pipeline-engine.js";
import { budgetStopReason, createRunContext } from "../run-context.js";
import { AgentSdkPhaseExecutor } from "../agent-sdk-phase-executor.js";

export interface RunOptions {
  generateOnly?: boolean;
}

export class TVAppHarness {
  private state: SessionState;
  private skills: SkillLibrary;
  private log: RunLog;
  private input: HarnessInput;
  private harness: HarnessConfig;
  private executor: AgentSdkPhaseExecutor;

  constructor(input: HarnessInput) {
    this.skills = new SkillLibrary(input.skillsDir);
    this.input = input;
    const ctx = createRunContext(input);
    this.harness = ctx.harness;
    this.log = ctx.log;
    this.state = ctx.state;
    this.executor = new AgentSdkPhaseExecutor({
      state: this.state,
      input: this.input,
      harness: this.harness,
      log: this.log,
      skills: this.skills,
    });
  }

  async run(options: RunOptions = {}): Promise<{ state: SessionState; outDir: string }> {
    const { active } = selectActivePhases(this.harness.phases, {
      platforms: this.state.config.platforms,
      generateOnly: options.generateOnly,
    });

    const results = await runPipeline({
      phases: active,
      // The SDK's inner tool loop handles its own iteration; no outer retry.
      maxRetries: 1,
      executor: (spec) => this.executor.executePhase(spec),
      hooks: {
        onPhaseStart: (spec) => {
          this.state.currentPhase = spec.name;
          this.log.phaseStart(spec.name, this.state.totalIterations);
          console.log(`\n  [${"=".repeat(40)}]`);
          console.log(`  Phase: ${spec.name}`);
          console.log(`  [${"=".repeat(40)}]\n`);
        },
        onPhaseEnd: (spec, result) => {
          this.state.phaseResults.set(spec.name, result);
          this.log.phaseEnd(spec.name, this.state.totalIterations, result.status);
          if (result.status === "failed") {
            console.log(`  Phase ${spec.name} FAILED: ${result.error}`);
          } else {
            console.log(`  Phase ${spec.name}: ${result.status}`);
            const phaseCost = this.executor.getPhaseCost(spec.name);
            if (phaseCost) {
              console.log(`  Cost: $${phaseCost.toFixed(4)}`);
            }
          }
        },
        onLog: (msg) => console.log(`  ${msg}`),
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
    return { state: this.state, outDir: this.state.workdir };
  }

  getState(): SessionState {
    return this.state;
  }
}
