import { Agent } from "@strands-agents/sdk";
import type { AgentResult, AgentStreamEvent } from "@strands-agents/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HarnessInput, Phase, PhaseResult, SessionState } from "./types.js";
import { AppSpecSchema } from "./types.js";
import type { HarnessConfig, PhaseSpec } from "./harness-config.js";
import type { RunLog } from "./run-log.js";
import type { PromptLoader } from "./prompt-loader.js";
import { buildDesignContext } from "./phase-prompts.js";
import { createModel, usageTracker } from "./model-factory.js";
import type { ModelProviderConfig } from "./model-factory.js";
import { createStrandsTools } from "./strands-tools.js";
import { runVisualQALoop } from "./visual-qa.js";
import {
  commitAfterPhase,
  executeClonePhase,
  writeHarnessReports,
  writeSpec,
} from "./run-context.js";
import { buildAgentPhaseUserMessage, buildSdkSystemPrompt, buildStrandsSkillsPlugin } from "./phase-context.js";
import type { HarnessEvents } from "./executors/claude-cli.js";

export class StrandsPhaseExecutor {
  private phaseCosts: Map<Phase, number> = new Map();

  constructor(private ctx: {
    state: SessionState;
    input: HarnessInput;
    events: HarnessEvents;
    harness: HarnessConfig;
    log: RunLog;
    prompts: PromptLoader;
    modelConfig: ModelProviderConfig;
  }) {}

  async executePhase(spec: PhaseSpec): Promise<PhaseResult> {
    this.ctx.state.totalIterations++;
    const phase = spec.name;

    if (spec.kind === "plan") return this.executePlanPhase();
    if (phase === "scaffold") return this.executeClonePhase();
    if (spec.kind === "visual_qa") return this.executeVisualQALoop();

    const appDir = join(this.ctx.state.workdir, "app");
    mkdirSync(appDir, { recursive: true });

    const systemPrompt = buildSdkSystemPrompt({
      spec,
      state: this.ctx.state,
      harnessInput: this.ctx.input,
      strands: true,
    });
    const userMessage = buildAgentPhaseUserMessage({
      phase,
      state: this.ctx.state,
      harnessInput: this.ctx.input,
      harness: this.ctx.harness,
      concise: true,
    });

    writeFileSync(
      join(this.ctx.state.workdir, `prompt-${phase}.md`),
      `# Phase: ${phase}\n\n## System Prompt\n\n${systemPrompt}\n\n## User Message\n\n${userMessage}\n`
    );

    const useTui = !process.argv.includes("--no-tui");
    const origWarn = console.warn;
    const origLog = console.log;
    let turns = 0;
    const toolLog: string[] = [];

    try {
      if (useTui) this.suppressNoisyConsole(origWarn, origLog);

      const tools = createStrandsTools({ appDir, workdir: this.ctx.state.workdir });
      const phaseModelConfig = this.ctx.harness.models.phaseModels?.[phase] ?? this.ctx.modelConfig;
      const model = createModel(phaseModelConfig);
      const skillsPlugin = buildStrandsSkillsPlugin(this.ctx.input.skillsDir, spec);

      const agent = new Agent({ model, tools, systemPrompt, plugins: [skillsPlugin], printer: false });
      const maxTurns = this.getMaxTurns(phase);
      let agentResult: AgentResult | undefined;
      const collectedText: string[] = [];
      const stream = agent.stream(userMessage, { limits: { turns: maxTurns } });

      let next = await stream.next();
      while (!next.done) {
        const event = next.value;
        this.handleStreamEvent(phase, event, turns);
        this.collectStreamArtifacts(event, collectedText, toolLog);

        if (event.type === "modelMessageEvent") {
          turns++;
          this.ctx.events.onIteration?.(phase, turns, maxTurns);
          this.trackEventUsage(event);
        }
        next = await stream.next();
      }
      agentResult = next.value;

      this.trackResultUsage(phase, agentResult);
      commitAfterPhase(this.ctx.state.workdir, phase);
      this.writePhaseResponse(phase, turns, agentResult, collectedText, toolLog);

      if (useTui) { console.warn = origWarn; console.log = origLog; }
      return { phase, status: "success", iterations: turns };
    } catch (err) {
      if (useTui) { console.warn = origWarn; console.log = origLog; }
      const message = err instanceof Error ? err.message : String(err);
      const fullError = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : JSON.stringify(err);
      this.ctx.log.error(phase, this.ctx.state.totalIterations, message);
      this.ctx.events.onLog?.(`Phase ${phase} error: ${message}`);
      writeFileSync(join(this.ctx.state.workdir, `error-${phase}.txt`), fullError);
      if (toolLog.length > 0) {
        writeFileSync(join(this.ctx.state.workdir, `response-${phase}.txt`),
          `# Phase: ${phase} — FAILED after ${turns} turns\n\nError: ${message}\n\n## Tool log:\n${toolLog.join("\n")}`);
      }
      return { phase, status: "failed", iterations: turns, error: message.slice(0, 200) };
    }
  }

  getPhaseCost(phase: Phase): number | undefined {
    return this.phaseCosts.get(phase);
  }

  writeReport(): void {
    writeHarnessReports({
      state: this.ctx.state,
      harness: this.ctx.harness,
      brand: this.ctx.input.brand,
      mode: "Strands Agent SDK",
      totalCost: [...this.phaseCosts.values()].reduce((sum, c) => sum + c, 0),
      phaseCosts: this.phaseCosts,
    });
  }

  private async executePlanPhase(): Promise<PhaseResult> {
    const systemPrompt = "You are a TV app planner. Given a user brief, content manifest, brand kit, and design tokens, produce an AppSpec JSON object. Output ONLY valid JSON matching the AppSpec schema. Do not include markdown fencing or explanation.";
    const designContext = buildDesignContext(this.ctx.input.design);
    const userMessage = `Brief: ${this.ctx.input.prompt}\n\nContent manifest: ${JSON.stringify(this.ctx.input.content)}\n\nBrand kit: ${JSON.stringify(this.ctx.input.brand)}\n\nDesign tokens:\n${designContext}\n\nProduce an AppSpec JSON object matching this schema:
- app_name: string
- theme: { mode: "dark"|"light", tokens: Record<string, string> }
- navigation: { type: "drawer"|"tabs"|"single", routes: [{id, label, icon?}] }
- screens: [{id, route, layout: "hero+rails"|"grid"|"detail"|"player"|"settings"|"search", uses_template_screen?, sections: [{id, kind: "featured_hero"|"rail"|"grid"|"text", data_source, title?}]}]
- components_to_customize: [{component, changes: Record<string,string>}]
- components_to_add: [{name, description, props: Record<string,string>}]
- data_bindings: [{manifest_path, screen_id, section_id}]
- player: { lib: "react-native-video" }
- auth?: { provider: "none"|"oauth", flow?: "device_code" }`;

    writeFileSync(join(this.ctx.state.workdir, "prompt-plan.md"), `# Phase: plan\n\n## System Prompt\n\n${systemPrompt}\n\n## User Message\n\n${userMessage}\n`);

    try {
      const model = createModel({ ...this.ctx.modelConfig });
      const agent = new Agent({ model, tools: [], systemPrompt, printer: false });
      const result = await agent.invoke(userMessage, { limits: { turns: 1 } });
      let resultText = "";
      for (const block of result.lastMessage.content) {
        if ("text" in block && typeof block.text === "string") resultText += block.text;
      }

      if (result.metrics) {
        const usage = result.metrics.accumulatedUsage;
        this.ctx.state.tokensUsed += usage.inputTokens + usage.outputTokens;
        this.ctx.events.onTokens?.(usage.inputTokens + usage.outputTokens);
        this.phaseCosts.set("plan", (usage.inputTokens * 15 + usage.outputTokens * 75) / 1_000_000);
      }

      writeFileSync(join(this.ctx.state.workdir, "plan-response.txt"), resultText);
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { phase: "plan", status: "failed", iterations: 1, error: "No JSON found in planner output" };

      this.ctx.state.spec = AppSpecSchema.parse(JSON.parse(jsonMatch[0]));
      writeSpec(this.ctx.state.workdir, this.ctx.state.spec);
      return { phase: "plan", status: "success", iterations: 1 };
    } catch (err) {
      const message = err instanceof Error ? `${err.message}\n${err.stack}` : JSON.stringify(err);
      return { phase: "plan", status: "failed", iterations: 1, error: message };
    }
  }

  private async executeVisualQALoop(): Promise<PhaseResult> {
    const appDir = join(this.ctx.state.workdir, "app");
    const runClaude = async (prompt: string, cwd: string): Promise<string> => {
      const model = createModel(this.ctx.harness.models.phaseModels?.["visual_qa_loop"] ?? this.ctx.modelConfig);
      const tools = createStrandsTools({ appDir: cwd, workdir: this.ctx.state.workdir });
      const agent = new Agent({ model, tools, systemPrompt: "You are a TV app visual QA agent.", printer: false });
      const result = await agent.invoke(prompt, { limits: { turns: 20 } });
      let text = "";
      for (const block of result.lastMessage.content) {
        if ("text" in block && typeof block.text === "string") text += block.text;
      }
      return text;
    };

    return runVisualQALoop({
      appDir,
      outDir: this.ctx.state.workdir,
      maxIterations: this.ctx.input.config.visual_qa_max_iterations,
      threshold: this.ctx.input.config.visual_qa_pass_threshold,
      brand: this.ctx.input.brand,
      design: this.ctx.input.design,
      spec: this.ctx.state.spec,
      platforms: this.ctx.input.config.platforms,
      prompts: this.ctx.prompts,
      useDevtools: this.ctx.input.config.use_devtools,
      runClaude,
      onLog: (msg) => this.ctx.events.onLog?.(msg),
      onIteration: (current, max) => this.ctx.events.onIteration?.("visual_qa_loop", current, max),
    });
  }

  private executeClonePhase(): PhaseResult {
    return executeClonePhase(this.ctx.state.workdir, this.ctx.harness, (msg) => this.ctx.events.onLog?.(msg));
  }

  private suppressNoisyConsole(origWarn: typeof console.warn, origLog: typeof console.log): void {
    console.warn = (...args: unknown[]) => {
      const msg = String(args[0] ?? "");
      if (msg.includes("YAML parse") || msg.includes("does not match parent") || msg.includes("unable to trim")) return;
      origWarn(...args);
    };
    console.log = (...args: unknown[]) => {
      const msg = String(args[0] ?? "");
      if (msg.includes("[tool]") || msg.includes("[text]") || msg.includes("[result]")) return;
      origLog(...args);
    };
  }

  private collectStreamArtifacts(event: AgentStreamEvent, collectedText: string[], toolLog: string[]): void {
    if (event.type === "contentBlockEvent") {
      const block = (event as { contentBlock?: { text?: string; name?: string } }).contentBlock;
      if (block?.text) collectedText.push(block.text);
      if (block?.name) toolLog.push(block.name);
    }
    if (event.type === "modelMessageEvent") {
      const msg = (event as { message?: { content?: Array<{ text?: string; name?: string; type?: string }> } }).message;
      if (msg?.content) {
        for (const block of msg.content) {
          if (block.text) collectedText.push(block.text);
          if (block.name || block.type === "tool_use") toolLog.push(block.name ?? "tool");
        }
      }
    }
    if (event.type === "toolResultEvent") {
      const raw = (event.result as { content?: unknown }).content ?? "";
      const text = typeof raw === "string" ? raw : JSON.stringify(raw);
      if (text.length > 5) toolLog.push(`  → ${text.slice(0, 80)}`);
    }
  }

  private trackEventUsage(event: AgentStreamEvent): void {
    const ev = event as unknown as Record<string, unknown>;
    const msg = ev.message as Record<string, unknown> | undefined;
    const usage = (msg?.usage ?? ev.usage ?? (ev as { invocationState?: { usage?: unknown } }).invocationState) as
      { inputTokens?: number; outputTokens?: number; input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined;
    if (!usage) return;
    const input = usage.inputTokens ?? usage.input_tokens ?? usage.prompt_tokens ?? 0;
    const output = usage.outputTokens ?? usage.output_tokens ?? usage.completion_tokens ?? 0;
    if (input + output > 0) {
      this.ctx.state.tokensUsed += input + output;
      this.ctx.events.onTokens?.(input + output);
    }
  }

  private trackResultUsage(phase: Phase, agentResult?: AgentResult): void {
    if (usageTracker.totalTokens > 0) {
      const cost = (usageTracker.inputTokens * 3 + usageTracker.outputTokens * 15) / 1_000_000;
      this.ctx.state.tokensUsed += usageTracker.totalTokens;
      this.ctx.events.onTokens?.(usageTracker.totalTokens);
      this.phaseCosts.set(phase, cost);
      usageTracker.reset();
    }
    if (agentResult?.metrics) {
      const usage = agentResult.metrics.accumulatedUsage as
        { inputTokens?: number; outputTokens?: number; input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
      const input = usage.inputTokens ?? usage.input_tokens ?? usage.prompt_tokens ?? 0;
      const output = usage.outputTokens ?? usage.output_tokens ?? usage.completion_tokens ?? 0;
      this.phaseCosts.set(phase, (input * 3 + output * 15) / 1_000_000);
      if (this.ctx.state.tokensUsed === 0 && input + output > 0) {
        this.ctx.state.tokensUsed += input + output;
        this.ctx.events.onTokens?.(input + output);
      }
    }
  }

  private writePhaseResponse(
    phase: Phase,
    turns: number,
    agentResult: AgentResult | undefined,
    collectedText: string[],
    toolLog: string[]
  ): void {
    let responseText = "";
    if (agentResult?.lastMessage) {
      for (const block of agentResult.lastMessage.content) {
        if ("text" in block && typeof block.text === "string") responseText += block.text;
      }
    }
    if (!responseText && collectedText.length > 0) responseText = collectedText.join("\n");
    if (!responseText && toolLog.length > 0) {
      responseText = `# Phase: ${phase} — Tool execution log (${turns} turns)\n\n` + toolLog.join("\n");
    }
    if (responseText) writeFileSync(join(this.ctx.state.workdir, `response-${phase}.txt`), responseText);
  }

  private handleStreamEvent(phase: Phase, event: AgentStreamEvent, turns: number): void {
    const verbose = process.argv.includes("--verbose") && process.argv.includes("--no-tui");
    if (event.type === "modelMessageEvent") {
      const msg = (event as { message?: { content?: Array<{ text?: string; type?: string; name?: string }> } }).message;
      if (msg?.content) {
        for (const block of msg.content) {
          if (block.text) this.logText(phase, turns, block.text, verbose);
          if (block.type === "tool_use" || block.name) this.logTool(phase, turns, block.name ?? "unknown", verbose);
        }
      }
    }
    if (event.type === "contentBlockEvent") {
      const block = event.contentBlock;
      if ("text" in block && typeof block.text === "string") this.logText(phase, turns, block.text, verbose);
      if ("name" in block && "toolUseId" in block) this.logTool(phase, turns, (block as { name: string }).name, verbose);
    }
    if (event.type === "toolResultEvent") {
      const raw = (event.result as { content?: unknown }).content ?? "";
      const text = typeof raw === "string" ? raw : JSON.stringify(raw);
      if (verbose) console.log(`    [result] ${text.slice(0, 100)}`);
      this.ctx.events.onPhaseMessage?.(phase, { type: "tool_result", content: text.slice(0, 200) });
    }
  }

  private logText(phase: Phase, turns: number, text: string, verbose: boolean): void {
    if (verbose) console.log(`    [text] ${text.slice(0, 150)}`);
    this.ctx.log.log({ phase, iteration: turns, event: "model_turn", message: text.slice(0, 500) });
    this.ctx.events.onPhaseMessage?.(phase, { type: "text", content: text.slice(0, 300) });
  }

  private logTool(phase: Phase, turns: number, toolName: string, verbose: boolean): void {
    if (verbose) console.log(`    [tool] ${toolName}`);
    this.ctx.log.toolCall(phase, turns, toolName, {});
    this.ctx.events.onPhaseMessage?.(phase, { type: "tool_use", content: toolName, toolName });
  }

  private getMaxTurns(phase: Phase): number {
    const limits: Partial<Record<string, number>> = {
      branding: 40,
      content: 50,
      screens: 50,
      creative_ui: 40,
      navigation: 30,
      verify: 20,
      build_loop: 30,
      android_test_loop: 30,
      visual_smoke_test: 10,
    };
    return limits[phase] ?? 30;
  }
}
