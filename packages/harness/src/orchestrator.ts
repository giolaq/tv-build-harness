import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  AppSpec,
  BrandKit,
  ContentManifest,
  Phase,
  PhaseResult,
  RunConfig,
  SessionState,
  ToolResult,
} from "./types.js";
import { V1_PHASES, AppSpecSchema } from "./types.js";
import { ToolRegistry } from "./tool-registry.js";
import { SkillLibrary } from "./skill-library.js";
import { RunLog } from "./run-log.js";

interface HarnessInput {
  prompt: string;
  content: ContentManifest;
  brand: BrandKit;
  config: RunConfig;
  workdir: string;
  skillsDir: string;
}

interface PhaseToolMap {
  [key: string]: string[];
}

const PHASE_TOOLS: PhaseToolMap = {
  plan: [],
  clone_template: ["clone_template"],
  metadata_branding: ["customize_app_metadata", "apply_theme", "replace_assets"],
  manifest_wiring: ["inject_content"],
  simulator_build: ["expo_prebuild", "run_simulator"],
  vega_build: ["vega_build"],
  visual_smoke_test: ["capture_screenshot", "run_smoke_test"],
};

export class TVAppHarness {
  private client: Anthropic;
  private state: SessionState;
  private tools: ToolRegistry;
  private skills: SkillLibrary;
  private log: RunLog;
  private input: HarnessInput;

  constructor(input: HarnessInput, tools: ToolRegistry) {
    this.client = new Anthropic();
    this.tools = tools;
    this.skills = new SkillLibrary(input.skillsDir);
    this.input = input;

    const runId = randomUUID().slice(0, 8);
    const outDir = join(input.workdir, "out", runId);
    mkdirSync(outDir, { recursive: true });

    this.log = new RunLog(join(outDir, "run.log"));

    this.state = {
      runId,
      workdir: outDir,
      config: input.config,
      spec: null,
      currentPhase: "plan",
      phaseResults: new Map(),
      iteration: 0,
      totalIterations: 0,
      tokenBudget: 500_000,
      tokensUsed: 0,
      messages: [],
    };
  }

  async run(): Promise<{ state: SessionState; outDir: string }> {
    const phases = this.getActivePhases();

    for (const phase of phases) {
      this.state.currentPhase = phase;
      this.log.phaseStart(phase, this.state.totalIterations);

      const result = await this.executePhase(phase);
      this.state.phaseResults.set(phase, result);

      this.log.phaseEnd(phase, this.state.totalIterations, result.status);

      if (this.state.tokensUsed >= this.state.tokenBudget) {
        console.error(`[harness] Token budget exhausted (${this.state.tokensUsed}/${this.state.tokenBudget}). Stopping.`);
        break;
      }
    }

    return { state: this.state, outDir: this.state.workdir };
  }

  private getActivePhases(): Phase[] {
    const { platforms } = this.state.config;
    return V1_PHASES.filter((phase) => {
      if (phase === "vega_build") {
        return platforms.includes("firetv-vega");
      }
      return true;
    });
  }

  private async executePhase(phase: Phase): Promise<PhaseResult> {
    const maxRetries = this.state.config.max_retries_per_phase;
    let iterations = 0;

    if (phase === "plan") {
      return this.executePlanPhase();
    }

    const systemPrompt = this.buildSystemPrompt(phase);
    const phaseTools = PHASE_TOOLS[phase] ?? [];
    const toolDefs = this.tools.getDefinitionsForNames(phaseTools);

    this.state.messages = [
      { role: "user", content: this.buildPhaseUserMessage(phase) },
    ];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      iterations++;
      this.state.totalIterations++;

      try {
        const response = await this.client.messages.create({
          model: "claude-sonnet-4-6-20250514",
          max_tokens: 4096,
          system: systemPrompt,
          tools: toolDefs as Anthropic.Tool[],
          messages: this.state.messages as Anthropic.MessageParam[],
        });

        this.state.tokensUsed += response.usage.input_tokens + response.usage.output_tokens;

        this.state.messages.push({ role: "assistant", content: response.content });

        const toolUses = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );

        if (toolUses.length === 0) {
          return { phase, status: "success", iterations };
        }

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUses) {
          this.log.toolCall(phase, iterations, toolUse.name, toolUse.input);
          const result = await this.tools.execute(
            toolUse.name,
            toolUse.input as Record<string, unknown>
          );
          this.log.toolResult(phase, iterations, toolUse.name, result);

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
            is_error: !result.ok,
          });
        }

        this.state.messages.push({ role: "user", content: toolResults });

        const allOk = toolResults.every((r) => !r.is_error);
        if (allOk && response.stop_reason === "end_turn") {
          return { phase, status: "success", iterations };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.log.error(phase, iterations, message);

        if (attempt === maxRetries - 1) {
          return { phase, status: "failed", iterations, error: message };
        }

        this.state.messages.push({
          role: "user",
          content: `Error occurred: ${message}. Please fix and retry.`,
        });
      }
    }

    return { phase, status: "degraded", iterations };
  }

  private async executePlanPhase(): Promise<PhaseResult> {
    try {
      const response = await this.client.messages.create({
        model: "claude-opus-4-7-20250501",
        max_tokens: 8192,
        system: `You are a TV app planner. Given a user brief, content manifest, and brand kit, produce an AppSpec JSON object. Output ONLY valid JSON matching the AppSpec schema. Do not include markdown fencing or explanation.`,
        messages: [
          {
            role: "user",
            content: `Brief: ${this.input.prompt}\n\nContent manifest: ${JSON.stringify(this.input.content)}\n\nBrand kit: ${JSON.stringify(this.input.brand)}\n\nProduce an AppSpec JSON object.`,
          },
        ],
      });

      this.state.tokensUsed += response.usage.input_tokens + response.usage.output_tokens;

      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );

      if (!textBlock) {
        return { phase: "plan", status: "failed", iterations: 1, error: "No text response from planner" };
      }

      const parsed = JSON.parse(textBlock.text);
      const spec = AppSpecSchema.parse(parsed);
      this.state.spec = spec;

      return { phase: "plan", status: "success", iterations: 1 };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { phase: "plan", status: "failed", iterations: 1, error: message };
    }
  }

  private buildSystemPrompt(phase: Phase): string {
    const metaSkill = this.skills.alwaysLoad();
    const phaseSkills = this.skills.loadForPhase(phase);

    const parts = [
      "You are a TV app development agent. You have access to tools for building and customizing TV applications.",
      "Execute the current phase by calling the appropriate tools. When all work is done, respond without tool calls.",
      "",
      "## App Spec",
      JSON.stringify(this.state.spec, null, 2),
      "",
      "## Skills",
      metaSkill,
      ...phaseSkills,
    ];

    return parts.join("\n");
  }

  private buildPhaseUserMessage(phase: Phase): string {
    const messages: Record<string, string> = {
      clone_template: `Clone the react-native-multi-tv-app-sample template and set up the project for app "${this.state.spec?.app_name}".`,
      metadata_branding: `Apply branding to the cloned template. Brand kit: ${JSON.stringify(this.input.brand)}`,
      manifest_wiring: `Wire the content manifest into the template screens. Manifest: ${JSON.stringify(this.input.content)}`,
      simulator_build: `Build and launch the app on simulators for platforms: ${this.state.config.platforms.join(", ")}`,
      vega_build: `Build the Vega OS variant of the app.`,
      visual_smoke_test: `Capture screenshots from each running simulator and run D-pad navigation smoke tests.`,
    };

    return messages[phase] ?? `Execute phase: ${phase}`;
  }

  getState(): SessionState {
    return this.state;
  }
}
