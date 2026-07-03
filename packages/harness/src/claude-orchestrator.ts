import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  Phase,
  PhaseResult,
  SessionState,
  HarnessInput,
} from "./types.js";
import { AppSpecSchema } from "./types.js";
import { SkillLibrary } from "./skill-library.js";
import { RunLog } from "./run-log.js";
import { PromptLoader } from "./prompt-loader.js";
import type { HarnessConfig, PhaseSpec } from "./harness-config.js";
import { runPipeline, selectActivePhases } from "./pipeline-engine.js";
import { runVerifyChecks } from "./verification.js";
import { saveCheckpoint, loadCheckpoint } from "./checkpoint.js";
import { invokeClaude, ClaudeCliError } from "./claude-cli.js";
import { runVisualQALoop } from "./visual-qa.js";
import { buildPlanPrompt } from "./phase-prompts.js";
import type { PhasePromptContext } from "./phase-prompts.js";
import {
  buildVerifyVars,
  commitAfterPhase,
  createPromptLoader,
  createRunContext,
  executeClonePhase,
  loadSpecIfPresent,
  writeHarnessReports,
  writeSpec,
} from "./run-context.js";
import { buildClaudeSkillContext, getPhaseInstructions, promptContext } from "./phase-context.js";

export interface RunOptions {
  generateOnly?: boolean;
  fromPhase?: string;
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
  private lastPhaseCost: number = 0;
  private totalCost: number = 0;
  private phaseCosts: Map<string, number> = new Map();
  private prompts: PromptLoader;
  private resumedPhases: Set<string> = new Set();
  // Resolved by the engine at run start; checkpoints are built from this.
  private effectiveCompleted: Set<string> = new Set();
  // Last verification failure per phase — fed back into the next attempt's prompt.
  private lastVerifyError: Map<string, string> = new Map();

  constructor(input: HarnessInput, events: HarnessEvents = {}) {
    this.skills = new SkillLibrary(input.skillsDir);
    this.input = input;
    this.events = events;
    this.prompts = createPromptLoader(input);

    const ctx = createRunContext(input);
    this.harness = ctx.harness;
    this.log = ctx.log;
    this.state = ctx.state;
  }

  static fromExistingRun(outDir: string, input: HarnessInput, events: HarnessEvents = {}): ClaudeOrchestrator {
    const instance = new ClaudeOrchestrator(input, events);
    instance.state.workdir = outDir;
    instance.state.runId = outDir.split("/").pop() ?? "rerun";

    loadSpecIfPresent(instance.state, outDir);

    instance.log = new RunLog(join(outDir, "run.log"));
    return instance;
  }

  /** Resumes a previous run from its checkpoint, skipping completed phases. */
  static resume(outDir: string, input: HarnessInput, events: HarnessEvents = {}): ClaudeOrchestrator {
    const instance = ClaudeOrchestrator.fromExistingRun(outDir, input, events);
    const checkpoint = loadCheckpoint(outDir);
    if (checkpoint) {
      instance.resumedPhases = new Set(checkpoint.completedPhases);
      instance.state.runId = checkpoint.runId;
    }
    return instance;
  }

  getResumedPhases(): Set<string> {
    return this.resumedPhases;
  }

  async runVisualQAOnly(): Promise<PhaseResult> {
    this.state.currentPhase = "visual_qa_loop";
    this.events.onPhaseStart?.("visual_qa_loop");
    const result = await this.executeVisualQALoop();
    this.events.onPhaseEnd?.("visual_qa_loop", result, this.lastPhaseCost);
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
      executor: (spec) => this.executePhase(spec),
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
          const phaseCost = this.lastPhaseCost;
          this.lastPhaseCost = 0;
          if (phaseCost) this.phaseCosts.set(spec.name, (this.phaseCosts.get(spec.name) ?? 0) + phaseCost);
          this.events.onPhaseEnd?.(spec.name, result, phaseCost);

          const label = result.status === "failed" ? "FAILED" : result.status === "degraded" ? "DEGRADED" : result.status;
          const detail = result.error ? `: ${result.error}` : "";
          if (!this.events.onLog) console.log(`  Phase ${spec.name} ${label}${detail}`);
          this.events.onLog?.(`Phase ${spec.name} ${label}${detail}`);
        },
        onPhaseSuccess: (spec) => {
          this.commitAfterPhase(spec.name);
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
          this.state.tokensUsed >= this.state.tokenBudget
            ? `Token budget exhausted (${this.state.tokensUsed}/${this.state.tokenBudget})`
            : null,
      },
    });

    for (const [name, result] of results) {
      this.state.phaseResults.set(name, result);
    }

    this.writeReport();
    this.checkSkillPromotions();
    return { state: this.state, outDir: this.state.workdir };
  }

  private checkSkillPromotions(): void {
    const stats = this.skills.getAutoSkillStats();
    for (const s of stats) {
      if (s.timesLoaded >= 3 && s.timesRecurred === 0) {
        const msg = `★ Skill "${s.name}" has prevented defects across ${s.timesLoaded}+ runs. Consider promoting to a core prompt.`;
        this.events.onLog?.(msg);
      }
    }
  }

  private checkpoint(): void {
    const completedPhases = [...this.effectiveCompleted];
    for (const [name, result] of this.state.phaseResults) {
      if ((result.status === "success" || result.status === "degraded") && !completedPhases.includes(name)) {
        completedPhases.push(name);
      }
    }
    saveCheckpoint(this.state.workdir, { runId: this.state.runId, completedPhases });
  }

  private async executePhase(spec: PhaseSpec): Promise<PhaseResult> {
    this.state.totalIterations++;
    const phase = spec.name;

    if (spec.kind === "plan") {
      return this.executePlanPhase();
    }

    if (spec.kind === "visual_qa") {
      return this.executeVisualQALoop();
    }

    const instructions = this.getPhaseInstructions(spec);
    if (!instructions) {
      return { phase, status: "degraded", iterations: 1, error: `No instructions for phase: ${phase}` };
    }

    const skillContext = buildClaudeSkillContext({
      spec,
      state: this.state,
      harnessInput: this.input,
      skills: this.skills,
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

    // Log prompt for debugging
    writeFileSync(
      join(this.state.workdir, `prompt-${phase}.md`),
      `# Phase: ${phase}\n\n## Full Prompt (${fullPrompt.length} chars)\n\n${fullPrompt}\n`
    );

    try {
      const appDir = join(this.state.workdir, "app");
      const cwd = spec.cwd === "out" ? this.state.workdir : appDir;
      mkdirSync(cwd, { recursive: true });

      const output = await this.runClaude(fullPrompt, cwd, spec.timeoutMs, spec.model);

      // Log full response
      writeFileSync(join(this.state.workdir, `response-${phase}.txt`), output);

      this.log.log({
        phase,
        iteration: this.state.totalIterations,
        event: "model_turn",
        message: output.slice(0, 500),
      });

      const verification = await runVerifyChecks(spec.verify, {
        appDir,
        vars: buildVerifyVars(this.input, this.state),
      });
      if (!verification.ok) {
        this.log.error(phase, this.state.totalIterations, verification.error!);
        this.lastVerifyError.set(phase, verification.error!);
        return { phase, status: "degraded", iterations: 1, error: verification.error };
      }

      this.lastVerifyError.delete(phase);
      return { phase, status: "success", iterations: 1 };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error(phase, this.state.totalIterations, message);
      return { phase, status: "failed", iterations: 1, error: message };
    }
  }

  private getPhaseInstructions(phaseSpec: PhaseSpec): string | null {
    return getPhaseInstructions(phaseSpec, this.promptContext());
  }

  private promptContext(): PhasePromptContext {
    return promptContext({
      outDir: this.state.workdir,
      input: this.input,
      state: this.state,
      harness: this.harness,
      prompts: this.prompts,
    });
  }

  private async executePlanPhase(): Promise<PhaseResult> {
    const planPrompt = buildPlanPrompt(this.promptContext());

    // Log plan prompt
    writeFileSync(
      join(this.state.workdir, "prompt-plan.md"),
      `# Phase: plan\n\n## Prompt (${planPrompt.length} chars)\n\n${planPrompt}\n`
    );

    try {
      const output = await this.runClaude(planPrompt, this.state.workdir);

      // Log raw response
      writeFileSync(join(this.state.workdir, "plan-response.txt"), output);

      if (!output.trim()) {
        return { phase: "plan", status: "failed", iterations: 1, error: "Planner returned empty output (transient CLI/rate-limit error — will retry)" };
      }

      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { phase: "plan", status: "failed", iterations: 1, error: `No JSON found in planner output: ${output.slice(0, 120)}` };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      this.state.spec = AppSpecSchema.parse(parsed);

      writeSpec(this.state.workdir, this.state.spec);

      return { phase: "plan", status: "success", iterations: 1 };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { phase: "plan", status: "failed", iterations: 1, error: message };
    }
  }

  private executeVisualQALoop(): Promise<PhaseResult> {
    return runVisualQALoop({
      appDir: join(this.state.workdir, "app"),
      outDir: this.state.workdir,
      maxIterations: this.input.config.visual_qa_max_iterations ?? 3,
      threshold: this.input.config.visual_qa_pass_threshold ?? "normal",
      brand: this.input.brand,
      design: this.input.design,
      spec: this.state.spec,
      platforms: this.input.config.platforms,
      prompts: this.prompts,
      useDevtools: this.input.config.use_devtools ?? false,
      runClaude: (prompt: string, cwd: string, timeoutMs?: number, allowedTools?: string) => this.runClaude(prompt, cwd, timeoutMs, undefined, allowedTools),
      onLog: (msg: string) => this.events.onLog?.(msg),
      onIteration: (current: number, max: number) => this.events.onIteration?.("visual_qa_loop", current, max),
    });
  }

  private commitAfterPhase(phase: Phase): void {
    commitAfterPhase(this.state.workdir, phase);
  }

  private writeReport(): void {
    writeHarnessReports({
      state: this.state,
      harness: this.harness,
      brand: this.input.brand,
      mode: "claude-run (CLI subprocess)",
      totalCost: this.totalCost,
      phaseCosts: this.phaseCosts,
    });
  }

  private async runClaude(prompt: string, cwd: string, timeoutMs?: number, model?: string, allowedTools?: string): Promise<string> {
    const phase = this.state.currentPhase;
    try {
      const result = await invokeClaude({
        prompt,
        cwd,
        timeoutMs,
        model,
        allowedTools,
        onEvent: (event) => this.handleStreamEvent(phase, event),
      });
      this.bookUsage(result);
      return result.text;
    } catch (err) {
      // Failed attempts still burned real tokens — count them or the budget
      // guard and cost report undercount exactly the expensive runs.
      if (err instanceof ClaudeCliError) this.bookUsage(err.partial);
      throw err;
    }
  }

  private bookUsage(result: { tokensUsed: number; costUsd: number }): void {
    if (result.tokensUsed) {
      this.state.tokensUsed += result.tokensUsed;
      this.events.onTokens?.(result.tokensUsed);
    }
    if (result.costUsd) {
      this.lastPhaseCost += result.costUsd; // accumulates across a phase's CLI calls; zeroed in onPhaseEnd
      this.totalCost += result.costUsd;
    }
  }

  private handleStreamEvent(phase: Phase, event: any): void {
    if (!this.events.onPhaseMessage) return;

    if (event.type === "assistant" && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === "text" && block.text) {
          this.events.onPhaseMessage(phase, { type: "text", content: block.text });
        } else if (block.type === "tool_use") {
          const input = typeof block.input === "string"
            ? block.input.slice(0, 200)
            : JSON.stringify(block.input ?? "").slice(0, 200);
          this.events.onPhaseMessage(phase, {
            type: "tool_use",
            content: input,
            toolName: block.name,
          });

          // Detect skill creation: Write/Edit to skills/auto/*.md
          if (block.name === "Write" || block.name === "Edit") {
            const filePath = typeof block.input === "object" ? (block.input?.file_path ?? "") : "";
            if (filePath.includes("skills/auto/") && filePath.endsWith(".md")) {
              const skillName = filePath.split("/").pop()?.replace(".md", "") ?? "unknown";
              this.events.onPhaseMessage(phase, {
                type: "text",
                content: `⚡ Skill created: ${skillName}`,
              });
              this.events.onLog?.(`⚡ Auto-skill created: ${skillName} (phase: ${phase})`);
            }
          }
        }
      }
    } else if (event.type === "tool_result" || (event.type === "user" && event.message?.content)) {
      const content = event.message?.content ?? event.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "tool_result" && block.content) {
            const text = typeof block.content === "string"
              ? block.content.slice(0, 300)
              : JSON.stringify(block.content).slice(0, 300);
            this.events.onPhaseMessage(phase, {
              type: "tool_result",
              content: text,
              toolName: block.tool_use_id,
            });
          }
        }
      }
    }
  }

  getState(): SessionState {
    return this.state;
  }
}
