import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Phase, PhaseResult, SessionState, HarnessInput } from "./types.js";
import { AppSpecSchema } from "./types.js";
import type { HarnessConfig, PhaseSpec } from "./harness-config.js";
import type { RunLog } from "./run-log.js";
import type { PromptLoader } from "./prompt-loader.js";
import type { SkillLibrary } from "./skill-library.js";
import { runVerifyChecks } from "./verification.js";
import { invokeClaude, ClaudeCliError } from "./claude-cli.js";
import type { ClaudeSpawn } from "./claude-cli.js";
import { runVisualQALoop } from "./visual-qa.js";
import { buildPlanPrompt } from "./phase-prompts.js";
import type { PhasePromptContext } from "./phase-prompts.js";
import {
  buildVerifyVars,
  bookCost,
  commitAfterPhase,
  isBudgetAbort,
  writeHarnessReports,
  writeSpec,
} from "./run-context.js";
import { buildClaudeSkillContext, getPhaseInstructions, promptContext } from "./phase-context.js";
import type { HarnessEvents } from "./executors/claude-cli.js";
import { Recorder } from "./recorder.js";

export class ClaudePhaseExecutor {
  private lastPhaseCost = 0;
  private totalCost = 0;
  private phaseCosts: Map<string, number> = new Map();
  private lastVerifyError: Map<string, string> = new Map();
  private recorder?: Recorder;

  constructor(private ctx: {
    state: SessionState;
    input: HarnessInput;
    events: HarnessEvents;
    harness: HarnessConfig;
    log: RunLog;
    skills: SkillLibrary;
    prompts: PromptLoader;
    record?: boolean;
    spawnImpl?: ClaudeSpawn;
  }) {
    this.recorder = new Recorder(join(ctx.state.workdir, "recording.json"), ctx.record ?? true);
  }

  async executePhase(spec: PhaseSpec): Promise<PhaseResult> {
    this.ctx.state.totalIterations++;
    const phase = spec.name;

    if (spec.kind === "plan") return this.executePlanPhase();
    if (spec.kind === "visual_qa") return this.executeVisualQALoop();

    const instructions = getPhaseInstructions(spec, this.promptContext());
    if (!instructions) {
      return { phase, status: "degraded", iterations: 1, error: `No instructions for phase: ${phase}` };
    }

    const skillContext = buildClaudeSkillContext({
      spec,
      state: this.ctx.state,
      harnessInput: this.ctx.input,
      skills: this.ctx.skills,
    });

    const previousFailure = this.lastVerifyError.get(phase);
    const fullPrompt = [
      skillContext,
      "",
      "## Your Task",
      instructions,
      ...(previousFailure
        ? [
            "",
            "## Previous attempt failed verification",
            "A prior attempt at this exact task did not pass the automated checks below.",
            "Fix these specific issues FIRST, then complete the task:",
            "",
            previousFailure,
          ]
        : []),
    ].join("\n");

    writeFileSync(
      join(this.ctx.state.workdir, `prompt-${phase}.md`),
      `# Phase: ${phase}\n\n## Full Prompt (${fullPrompt.length} chars)\n\n${fullPrompt}\n`
    );

    try {
      const appDir = join(this.ctx.state.workdir, "app");
      const cwd = spec.cwd === "out" ? this.ctx.state.workdir : appDir;
      mkdirSync(cwd, { recursive: true });

      const output = await this.runClaude(fullPrompt, cwd, {
        timeoutMs: spec.timeoutMs,
        model: spec.model,
        allowedTools: spec.allowedTools,
        recordedModel: spec.model ?? this.ctx.harness.models.execution,
        phase,
        system: "claude-run phase prompt",
      });
      writeFileSync(join(this.ctx.state.workdir, `response-${phase}.txt`), output);

      this.ctx.log.log({
        phase,
        iteration: this.ctx.state.totalIterations,
        event: "model_turn",
        message: output.slice(0, 500),
      });

      const verification = await runVerifyChecks(spec.verify, {
        appDir,
        vars: buildVerifyVars(this.ctx.input, this.ctx.state),
      });
      if (!verification.ok) {
        this.ctx.log.error(phase, this.ctx.state.totalIterations, verification.error!);
        this.lastVerifyError.set(phase, verification.error!);
        return { phase, status: "degraded", iterations: 1, error: verification.error };
      }

      this.lastVerifyError.delete(phase);
      return { phase, status: "success", iterations: 1 };
    } catch (err) {
      if (isBudgetAbort(err)) {
        this.ctx.log.error(phase, this.ctx.state.totalIterations, err.message);
        return { phase, status: "aborted", iterations: 1, error: err.message };
      }
      const message = err instanceof Error ? err.message : String(err);
      this.ctx.log.error(phase, this.ctx.state.totalIterations, message);
      return { phase, status: "failed", iterations: 1, error: message };
    }
  }

  executeVisualQALoop(): Promise<PhaseResult> {
    return runVisualQALoop({
      appDir: join(this.ctx.state.workdir, "app"),
      outDir: this.ctx.state.workdir,
      maxIterations: this.ctx.input.config.visual_qa_max_iterations ?? 3,
      threshold: this.ctx.input.config.visual_qa_pass_threshold ?? "normal",
      brand: this.ctx.input.brand,
      design: this.ctx.input.design,
      spec: this.ctx.state.spec,
      platforms: this.ctx.input.config.platforms,
      prompts: this.ctx.prompts,
      useDevtools: this.ctx.input.config.use_devtools ?? false,
      runClaude: (prompt: string, cwd: string, timeoutMs?: number, allowedTools?: string) =>
        this.runClaude(prompt, cwd, {
          timeoutMs,
          allowedTools,
          recordedModel: this.ctx.harness.models.execution,
          phase: "visual_qa_loop",
          system: "claude-run visual QA prompt",
        }),
      onLog: (msg: string) => this.ctx.events.onLog?.(msg),
      onIteration: (current: number, max: number) => this.ctx.events.onIteration?.("visual_qa_loop", current, max),
    });
  }

  finishPhaseCost(phase: Phase): number {
    const phaseCost = this.lastPhaseCost;
    this.lastPhaseCost = 0;
    if (phaseCost) this.phaseCosts.set(phase, (this.phaseCosts.get(phase) ?? 0) + phaseCost);
    return phaseCost;
  }

  commitAfterPhase(phase: Phase): void {
    commitAfterPhase(this.ctx.state.workdir, phase);
  }

  writeReport(): void {
    writeHarnessReports({
      state: this.ctx.state,
      harness: this.ctx.harness,
      brand: this.ctx.input.brand,
      mode: "claude-run (CLI subprocess)",
      totalCost: this.totalCost,
      phaseCosts: this.phaseCosts,
    });
  }

  private promptContext(): PhasePromptContext {
    return promptContext({
      outDir: this.ctx.state.workdir,
      input: this.ctx.input,
      state: this.ctx.state,
      harness: this.ctx.harness,
      prompts: this.ctx.prompts,
    });
  }

  private async executePlanPhase(): Promise<PhaseResult> {
    const planPrompt = buildPlanPrompt(this.promptContext());
    writeFileSync(
      join(this.ctx.state.workdir, "prompt-plan.md"),
      `# Phase: plan\n\n## Prompt (${planPrompt.length} chars)\n\n${planPrompt}\n`
    );

    try {
      const output = await this.runClaude(planPrompt, this.ctx.state.workdir, {
        recordedModel: this.ctx.harness.models.plan,
        phase: "plan",
        system: "claude-run plan prompt",
      });
      writeFileSync(join(this.ctx.state.workdir, "plan-response.txt"), output);

      if (!output.trim()) {
        return { phase: "plan", status: "failed", iterations: 1, error: "Planner returned empty output (transient CLI/rate-limit error — will retry)" };
      }

      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { phase: "plan", status: "failed", iterations: 1, error: `No JSON found in planner output: ${output.slice(0, 120)}` };
      }

      this.ctx.state.spec = AppSpecSchema.parse(JSON.parse(jsonMatch[0]));
      this.ctx.state.spec.creative_seed = this.ctx.state.creativeSeed;
      writeSpec(this.ctx.state.workdir, this.ctx.state.spec, this.ctx.state.creativeSeed);
      return { phase: "plan", status: "success", iterations: 1 };
    } catch (err) {
      if (isBudgetAbort(err)) {
        return { phase: "plan", status: "aborted", iterations: 1, error: err.message };
      }
      const message = err instanceof Error ? err.message : String(err);
      return { phase: "plan", status: "failed", iterations: 1, error: message };
    }
  }

  private async runClaude(prompt: string, cwd: string, options: {
    timeoutMs?: number;
    model?: string;
    allowedTools?: string;
    recordedModel: string;
    phase: Phase;
    system: string;
  }): Promise<string> {
    const phase = options.phase;
    const events: Record<string, unknown>[] = [];
    try {
      const result = await invokeClaude({
        prompt,
        cwd,
        timeoutMs: options.timeoutMs,
        model: options.model,
        allowedTools: options.allowedTools,
        spawnImpl: this.ctx.spawnImpl,
        onEvent: (event) => {
          events.push(event);
          this.handleStreamEvent(phase, event);
        },
      });
      this.bookUsage(result);
      this.recordTurn(phase, options.recordedModel, options.system, prompt, events, result.usage);
      return result.text;
    } catch (err) {
      if (err instanceof ClaudeCliError) {
        this.bookUsage(err.partial);
        if (events.length > 0) {
          this.recordTurn(phase, options.recordedModel, options.system, prompt, events, err.partial.usage);
        }
      }
      throw err;
    }
  }

  private recordTurn(
    phase: Phase,
    model: string,
    system: string,
    prompt: string,
    response: Record<string, unknown>[],
    usage: { input_tokens: number; output_tokens: number }
  ): void {
    this.recorder?.record({
      timestamp: new Date().toISOString(),
      phase,
      seed: this.ctx.state.creativeSeed,
      request: {
        model,
        system,
        messages: [{ role: "user", content: prompt }],
      },
      response,
      usage,
    });
    this.recorder?.save();
  }

  private bookUsage(result: { tokensUsed: number; costUsd: number }): void {
    if (result.tokensUsed) {
      this.ctx.state.tokensUsed += result.tokensUsed;
      this.ctx.events.onTokens?.(result.tokensUsed);
    }
    if (result.costUsd) {
      this.lastPhaseCost += result.costUsd;
      this.totalCost += result.costUsd;
      bookCost(this.ctx.state, result.costUsd);
    }
  }

  private handleStreamEvent(phase: Phase, event: any): void {
    if (!this.ctx.events.onPhaseMessage) return;

    if (event.type === "assistant" && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === "text" && block.text) {
          this.ctx.events.onPhaseMessage(phase, { type: "text", content: block.text });
        } else if (block.type === "tool_use") {
          const input = typeof block.input === "string"
            ? block.input
            : JSON.stringify(block.input ?? "", null, 2);
          this.ctx.events.onPhaseMessage(phase, { type: "tool_use", content: input, toolName: block.name });

        }
      }
    } else if (event.type === "tool_result" || (event.type === "user" && event.message?.content)) {
      const content = event.message?.content ?? event.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "tool_result" && block.content) {
            const text = typeof block.content === "string"
              ? block.content
              : JSON.stringify(block.content, null, 2);
            this.ctx.events.onPhaseMessage(phase, {
              type: "tool_result",
              content: text,
              toolName: block.tool_use_id,
            });
          }
        }
      }
    }
  }
}
