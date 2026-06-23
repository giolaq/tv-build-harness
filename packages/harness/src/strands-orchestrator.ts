import { Agent } from "@strands-agents/sdk";
import { AgentSkills, Skill } from "@strands-agents/sdk/vended-plugins/skills";
import type { AgentStreamEvent, AgentResult } from "@strands-agents/sdk";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type {
  Phase,
  PhaseResult,
  SessionState,
  HarnessInput,
} from "./types.js";
import { AppSpecSchema } from "./types.js";
import { RunLog } from "./run-log.js";
import { writeRunReport } from "./run-report.js";
import { DEFAULT_HARNESS_CONFIG } from "./harness-config.js";
import type { HarnessConfig, PhaseSpec } from "./harness-config.js";
import { runPipeline, selectActivePhases } from "./pipeline-engine.js";
import { buildDesignContext } from "./phase-prompts.js";
import { createModel, usageTracker } from "./model-factory.js";
import type { ModelProviderConfig } from "./model-factory.js";
import { createStrandsTools } from "./strands-tools.js";
import { runVisualQALoop } from "./visual-qa.js";
import { PromptLoader } from "./prompt-loader.js";
import type { HarnessEvents } from "./claude-orchestrator.js";

export interface StrandsRunOptions {
  generateOnly?: boolean;
}

export class StrandsOrchestrator {
  private state: SessionState;
  private log: RunLog;
  private input: HarnessInput;
  private events: HarnessEvents;
  private harness: HarnessConfig;
  private phaseCosts: Map<Phase, number> = new Map();
  private modelConfig: ModelProviderConfig;

  constructor(input: HarnessInput, events: HarnessEvents = {}) {
    this.input = input;
    this.events = events;
    this.harness = input.harness ?? DEFAULT_HARNESS_CONFIG;

    if (this.harness.models.strandsProvider) {
      this.modelConfig = this.harness.models.strandsProvider;
    } else {
      this.modelConfig = {
        provider: "anthropic",
        modelId: this.harness.models.execution,
        maxTokens: 8192,
      };
    }

    const runId = randomUUID().slice(0, 8);
    const outDir = join(input.workdir, "out", runId);
    mkdirSync(outDir, { recursive: true });
    mkdirSync(join(outDir, "screenshots"), { recursive: true });

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
      tokenBudget: 0, // unlimited in API mode — cost is tracked but not capped
      tokensUsed: 0,
      messages: [],
    };
  }

  async run(options: StrandsRunOptions = {}): Promise<{ state: SessionState; outDir: string }> {
    const { active } = selectActivePhases(this.harness.phases, {
      platforms: this.state.config.platforms,
      generateOnly: options.generateOnly,
    });

    const results = await runPipeline({
      phases: active,
      maxRetries: 1,
      executor: (spec) => this.executePhase(spec),
      hooks: {
        onPhaseStart: (spec) => {
          this.state.currentPhase = spec.name;
          this.log.phaseStart(spec.name, this.state.totalIterations);
          this.events.onPhaseStart?.(spec.name);
        },
        onPhaseEnd: (spec, result) => {
          this.state.phaseResults.set(spec.name, result);
          this.log.phaseEnd(spec.name, this.state.totalIterations, result.status);
          this.events.onPhaseEnd?.(spec.name, result, this.phaseCosts.get(spec.name));
        },
        onLog: (msg) => {
          this.events.onLog?.(msg);
        },
        shouldStop: () =>
          this.state.tokenBudget > 0 && this.state.tokensUsed >= this.state.tokenBudget
            ? `Token budget exhausted (${this.state.tokensUsed}/${this.state.tokenBudget})`
            : null,
      },
    });

    for (const [name, result] of results) {
      this.state.phaseResults.set(name, result);
    }

    this.writeReport();
    return { state: this.state, outDir: this.state.workdir };
  }

  private async executePhase(spec: PhaseSpec): Promise<PhaseResult> {
    this.state.totalIterations++;
    const phase = spec.name;

    if (spec.kind === "plan") {
      return this.executePlanPhase();
    }

    if (phase === "scaffold") {
      return this.executeClonePhase();
    }

    if (spec.kind === "visual_qa") {
      return this.executeVisualQALoop();
    }

    const appDir = join(this.state.workdir, "app");
    mkdirSync(appDir, { recursive: true });

    const systemPrompt = this.buildSystemPrompt(spec);
    const userMessage = this.buildPhaseUserMessage(phase);

    // Log prompts for debugging
    const promptLogPath = join(this.state.workdir, `prompt-${phase}.md`);
    writeFileSync(promptLogPath, `# Phase: ${phase}\n\n## System Prompt\n\n${systemPrompt}\n\n## User Message\n\n${userMessage}\n`);

    // Suppress Strands SDK console warnings when TUI is active
    const useTui = !process.argv.includes("--no-tui");
    const origWarn = console.warn;
    const origLog = console.log;
    let turns = 0;
    const toolLog: string[] = [];

    try {
      if (useTui) {
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

      const tools = createStrandsTools({
        appDir,
        workdir: this.state.workdir,
      });

      const phaseModelConfig = this.harness.models.phaseModels?.[phase] ?? this.modelConfig;
      const model = createModel(phaseModelConfig);
      const skillsPlugin = this.buildSkillsPlugin(spec);

      const agent = new Agent({
        model,
        tools,
        systemPrompt,
        plugins: [skillsPlugin],
        printer: false,
      });

      const maxTurns = this.getMaxTurns(phase);
      let agentResult: AgentResult | undefined;
      const collectedText: string[] = [];

      const stream = agent.stream(userMessage, {
        limits: { turns: maxTurns },
      });

      // Manually iterate the async generator to capture its return value
      let next = await stream.next();
      while (!next.done) {
        const event = next.value;
        this.handleStreamEvent(phase, event, turns);

        // Collect text from any event that carries it
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
          const result = event.result;
          const raw = (result as { content?: unknown }).content ?? "";
          const text = typeof raw === "string" ? raw : JSON.stringify(raw);
          if (text.length > 5) toolLog.push(`  → ${text.slice(0, 80)}`);
        }

        // Track turns and tokens from model message events
        if (event.type === "modelMessageEvent") {
          turns++;
          this.events.onIteration?.(phase, turns, maxTurns);
          // Extract usage — try multiple locations (Anthropic vs OpenAI format)
          const ev = event as unknown as Record<string, unknown>;
          const msg = ev.message as Record<string, unknown> | undefined;
          const usage = (msg?.usage ?? ev.usage ?? (ev as { invocationState?: { usage?: unknown } }).invocationState) as
            { inputTokens?: number; outputTokens?: number; input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined;
          if (usage) {
            const input = usage.inputTokens ?? usage.input_tokens ?? usage.prompt_tokens ?? 0;
            const output = usage.outputTokens ?? usage.output_tokens ?? usage.completion_tokens ?? 0;
            const turnTokens = input + output;
            if (turnTokens > 0) {
              this.state.tokensUsed += turnTokens;
              this.events.onTokens?.(turnTokens);
            }
          }
        }
        next = await stream.next();
      }
      agentResult = next.value;

      // Extract cost from the AgentResult
      // Use the module-level usageTracker for OpenRouter (which doesn't populate agentResult.metrics)
      if (usageTracker.totalTokens > 0) {
        const phaseInput = usageTracker.inputTokens;
        const phaseOutput = usageTracker.outputTokens;
        this.state.tokensUsed += usageTracker.totalTokens;
        this.events.onTokens?.(usageTracker.totalTokens);
        const cost = (phaseInput * 3 + phaseOutput * 15) / 1_000_000;
        this.phaseCosts.set(phase, cost);
        usageTracker.reset();
      }
      if (agentResult?.metrics) {

        const usage = agentResult.metrics.accumulatedUsage as
          { inputTokens?: number; outputTokens?: number; input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
        const input = usage.inputTokens ?? usage.input_tokens ?? usage.prompt_tokens ?? 0;
        const output = usage.outputTokens ?? usage.output_tokens ?? usage.completion_tokens ?? 0;
        const cost = (input * 3 + output * 15) / 1_000_000;
        this.phaseCosts.set(phase, cost);
        // If per-turn tracking missed tokens, catch up here
        if (this.state.tokensUsed === 0 && (input + output) > 0) {
          this.state.tokensUsed += input + output;
          this.events.onTokens?.(input + output);
        }
      }

      // Auto-commit after each phase (mirrors claude-run git snapshots)
      try {
        execSync("git add -A && git diff --cached --quiet || git commit -m \"phase: " + phase + "\"", {
          cwd: join(this.state.workdir, "app"),
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 10_000,
        });
      } catch { /* no changes to commit or git not initialized */ }

      // Write phase response for debugging (mirrors claude-run behavior)
      let responseText = "";
      if (agentResult?.lastMessage) {
        for (const block of agentResult.lastMessage.content) {
          if ("text" in block && typeof block.text === "string") {
            responseText += block.text;
          }
        }
      }
      if (!responseText && collectedText.length > 0) {
        responseText = collectedText.join("\n");
      }
      if (!responseText && toolLog.length > 0) {
        responseText = `# Phase: ${phase} — Tool execution log (${turns} turns)\n\n` + toolLog.join("\n");
      }
      if (responseText) {
        writeFileSync(join(this.state.workdir, `response-${phase}.txt`), responseText);
      }

      if (useTui) { console.warn = origWarn; console.log = origLog; }
      return { phase, status: "success", iterations: turns };
    } catch (err) {
      if (useTui) { console.warn = origWarn; console.log = origLog; }
      const message = err instanceof Error ? err.message : String(err);
      const fullError = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : JSON.stringify(err);
      this.log.error(phase, this.state.totalIterations, message);
      this.events.onLog?.(`Phase ${phase} error: ${message}`);
      writeFileSync(join(this.state.workdir, `error-${phase}.txt`), fullError);
      // Also write tool log so far as the response
      if (toolLog.length > 0) {
        writeFileSync(join(this.state.workdir, `response-${phase}.txt`),
          `# Phase: ${phase} — FAILED after ${turns} turns\n\nError: ${message}\n\n## Tool log:\n${toolLog.join("\n")}`);
      }
      return { phase, status: "failed", iterations: turns, error: message.slice(0, 200) };
    }
  }

  private handleStreamEvent(phase: Phase, event: AgentStreamEvent, turns: number): void {
    const verbose = process.argv.includes("--verbose") && process.argv.includes("--no-tui");

    // OpenAI/OpenRouter models emit text via modelMessageEvent, not contentBlockEvent
    if (event.type === "modelMessageEvent") {
      const msg = (event as { message?: { content?: Array<{ text?: string; type?: string; name?: string; toolUseId?: string }> } }).message;
      if (msg?.content) {
        for (const block of msg.content) {
          if (block.text) {
            if (verbose) console.log(`    [text] ${block.text.slice(0, 150)}`);
            this.log.log({ phase, iteration: turns, event: "model_turn", message: block.text.slice(0, 500) });
            this.events.onPhaseMessage?.(phase, { type: "text", content: block.text.slice(0, 300) });
          }
          if (block.type === "tool_use" || block.name) {
            const toolName = block.name ?? "unknown";
            if (verbose) console.log(`    [tool] ${toolName}`);
            this.log.toolCall(phase, turns, toolName, {});
            this.events.onPhaseMessage?.(phase, { type: "tool_use", content: toolName, toolName });
          }
        }
      }
    }

    if (event.type === "contentBlockEvent") {
      const block = event.contentBlock;
      if ("text" in block && typeof block.text === "string") {
        if (verbose) {
          console.log(`    [text] ${block.text.slice(0, 150)}`);
        }
        this.log.log({ phase, iteration: turns, event: "model_turn", message: block.text.slice(0, 500) });
        this.events.onPhaseMessage?.(phase, {
          type: "text",
          content: block.text.slice(0, 300),
        });
      }
      if ("name" in block && "toolUseId" in block) {
        const toolName = (block as { name: string }).name;
        if (verbose) {
          console.log(`    [tool] ${toolName}`);
        }
        this.log.toolCall(phase, turns, toolName, {});
        this.events.onPhaseMessage?.(phase, {
          type: "tool_use",
          content: toolName,
          toolName,
        });
      }
    }

    if (event.type === "toolResultEvent") {
      const result = event.result;
      const raw = (result as { content?: unknown }).content ?? "";
      const text = typeof raw === "string" ? raw : JSON.stringify(raw);
      if (verbose) {
        console.log(`    [result] ${text.slice(0, 100)}`);
      }
      this.events.onPhaseMessage?.(phase, {
        type: "tool_result",
        content: text.slice(0, 200),
      });
    }
  }

  private async executePlanPhase(): Promise<PhaseResult> {
    const systemPrompt = `You are a TV app planner. Given a user brief, content manifest, brand kit, and design tokens, produce an AppSpec JSON object. Output ONLY valid JSON matching the AppSpec schema. Do not include markdown fencing or explanation.`;

    const designContext = buildDesignContext(this.input.design);

    const userMessage = `Brief: ${this.input.prompt}\n\nContent manifest: ${JSON.stringify(this.input.content)}\n\nBrand kit: ${JSON.stringify(this.input.brand)}\n\nDesign tokens:\n${designContext}\n\nProduce an AppSpec JSON object matching this schema:
- app_name: string
- theme: { mode: "dark"|"light", tokens: Record<string, string> }
- navigation: { type: "drawer"|"tabs"|"single", routes: [{id, label, icon?}] }
- screens: [{id, route, layout: "hero+rails"|"grid"|"detail"|"player"|"settings"|"search", uses_template_screen?, sections: [{id, kind: "featured_hero"|"rail"|"grid"|"text", data_source, title?}]}]
- components_to_customize: [{component, changes: Record<string,string>}]
- components_to_add: [{name, description, props: Record<string,string>}]
- data_bindings: [{manifest_path, screen_id, section_id}]
- player: { lib: "react-native-video" }
- auth?: { provider: "none"|"oauth", flow?: "device_code" }`;

    // Log plan prompt
    const promptLogPath = join(this.state.workdir, "prompt-plan.md");
    writeFileSync(promptLogPath, `# Phase: plan\n\n## System Prompt\n\n${systemPrompt}\n\n## User Message\n\n${userMessage}\n`);

    try {
      // Use a separate model config for planning (may use opus)
      // Use the strandsProvider modelId for plan (don't override with legacy model string names)
      const planModelConfig: ModelProviderConfig = { ...this.modelConfig };
      const model = createModel(planModelConfig);

      const agent = new Agent({
        model,
        tools: [],
        systemPrompt,
        printer: false,
      });

      const result = await agent.invoke(userMessage, {
        limits: { turns: 1 },
      });

      // Extract text from the last message
      let resultText = "";
      for (const block of result.lastMessage.content) {
        if ("text" in block && typeof block.text === "string") {
          resultText += block.text;
        }
      }

      // Track tokens from the AgentResult
      if (result.metrics) {
        const usage = result.metrics.accumulatedUsage;
        this.state.tokensUsed += usage.inputTokens + usage.outputTokens;
        this.events.onTokens?.(usage.inputTokens + usage.outputTokens);

        const cost = (usage.inputTokens * 15 + usage.outputTokens * 75) / 1_000_000;
        this.phaseCosts.set("plan", cost);
      }

      // Log the raw response
      writeFileSync(join(this.state.workdir, "plan-response.txt"), resultText);

      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { phase: "plan", status: "failed", iterations: 1, error: "No JSON found in planner output" };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const spec = AppSpecSchema.parse(parsed);
      this.state.spec = spec;

      writeFileSync(
        join(this.state.workdir, "spec.json"),
        JSON.stringify(this.state.spec, null, 2)
      );

      return { phase: "plan", status: "success", iterations: 1 };
    } catch (err) {
      const message = err instanceof Error ? `${err.message}\n${err.stack}` : JSON.stringify(err);
      return { phase: "plan", status: "failed", iterations: 1, error: message };
    }
  }

  private async executeVisualQALoop(): Promise<PhaseResult> {
    const appDir = join(this.state.workdir, "app");
    const prompts = new PromptLoader(join(import.meta.dirname ?? ".", "../prompts"));

    const runClaude = async (prompt: string, cwd: string, timeoutMs?: number, allowedTools?: string): Promise<string> => {
      // Use the Strands agent for visual QA sub-tasks
      const model = createModel(this.harness.models.phaseModels?.["visual_qa_loop"] ?? this.modelConfig);
      const tools = createStrandsTools({ appDir: cwd, workdir: this.state.workdir });
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
      outDir: this.state.workdir,
      maxIterations: this.input.config.visual_qa_max_iterations,
      threshold: this.input.config.visual_qa_pass_threshold,
      brand: this.input.brand,
      design: this.input.design,
      spec: this.state.spec,
      platforms: this.input.config.platforms,
      prompts,
      useDevtools: this.input.config.use_devtools,
      runClaude,
      onLog: (msg) => this.events.onLog?.(msg),
      onIteration: (current, max) => this.events.onIteration?.("visual_qa_loop", current, max),
    });
  }

  private executeClonePhase(): PhaseResult {
    const appDir = join(this.state.workdir, "app");

    if (existsSync(join(appDir, "package.json"))) {
      return { phase: "scaffold", status: "success", iterations: 0 };
    }

    try {
      this.events.onLog?.("Cloning template...");
      const branchFlag = this.harness.template.branch ? ` --branch ${this.harness.template.branch}` : "";
      execSync(
        `git clone --depth 1${branchFlag} ${this.harness.template.repo} "${appDir}"`,
        { stdio: "pipe", timeout: 60_000 }
      );
      execSync(`rm -rf "${join(appDir, ".git")}"`, { stdio: "pipe" });
      execSync("git init && git add -A && git commit -m \"initial template\"", {
        cwd: appDir, stdio: "pipe",
      });
      this.events.onLog?.("Installing dependencies...");
      execSync("yarn install", { cwd: appDir, stdio: "pipe", timeout: 180_000 });
      this.events.onLog?.("Template ready.");
      return { phase: "scaffold", status: "success", iterations: 0 };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { phase: "scaffold", status: "failed", iterations: 0, error: message.slice(0, 200) };
    }
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

  private buildSystemPrompt(_spec: PhaseSpec): string {
    const parts = [
      "You are a TV app development agent. You have access to specialized TV app tools.",
      "Execute the current phase by using the appropriate tools.",
      "Use the `skills` tool to load domain knowledge when needed — available skills are listed in <available_skills>.",
      "",
      "## App Spec",
      JSON.stringify(this.state.spec, null, 2),
      "",
      "## Design System",
      buildDesignContext(this.input.design),
    ];

    return parts.join("\n");
  }

  private buildSkillsPlugin(spec: PhaseSpec): AgentSkills {
    const skillSources: (string | Skill)[] = [];

    // Always load the meta skill (new dir format first, then flat file fallback)
    const metaDirPath = join(this.input.skillsDir, "meta");
    const metaFlatPath = join(this.input.skillsDir, "meta.md");
    if (existsSync(join(metaDirPath, "SKILL.md"))) {
      skillSources.push(Skill.fromFile(metaDirPath, { strict: false }));
    } else if (existsSync(metaFlatPath)) {
      const content = readFileSync(metaFlatPath, "utf-8");
      skillSources.push(Skill.fromContent(content, { strict: false }));
    }

    // Load phase-specific skills (new dir format first, then flat file fallback)
    for (const skillName of spec.skills) {
      const skillDirPath = join(this.input.skillsDir, skillName);
      const skillFlatPath = join(this.input.skillsDir, `${skillName}.md`);
      if (existsSync(join(skillDirPath, "SKILL.md"))) {
        skillSources.push(Skill.fromFile(skillDirPath, { strict: false }));
      } else if (existsSync(skillFlatPath)) {
        const content = readFileSync(skillFlatPath, "utf-8");
        skillSources.push(Skill.fromContent(content, { strict: false }));
      }
    }

    // Also load auto-skills if they exist (flat files in auto/)
    const autoDir = join(this.input.skillsDir, "auto");
    if (existsSync(autoDir)) {
      const autoFiles = readdirSync(autoDir).filter(f => f.endsWith(".md"));
      for (const file of autoFiles) {
        const filePath = join(autoDir, file);
        const content = readFileSync(filePath, "utf-8");
        skillSources.push(Skill.fromContent(content, { strict: false }));
      }
    }

    return new AgentSkills({ skills: skillSources, strict: false });
  }

  private buildPhaseUserMessage(phase: Phase): string {
    const appDir = join(this.state.workdir, "app");
    const messages: Record<string, string> = {
      scaffold: `Clone the react-native-multi-tv-app-sample template into "${appDir}" and install dependencies. App name: "${this.state.spec?.app_name}".`,
      branding: `Apply branding to the app at ${appDir}. Brand: name="${this.input.brand.name}", primary=${this.input.brand.primary_color}, accent=${this.input.brand.accent_color}, bg=${this.input.brand.background_color}, font=${this.input.brand.font_family}. Find and edit the theme token files in packages/shared-ui/. Update app.json with the app name.`,
      content: `Wire this content manifest into the app at ${appDir}.\n\nYou MUST do ALL of these steps:\n1. Write the content JSON to packages/shared-ui/src/data/content.json\n2. Create data hooks in packages/shared-ui/src/data/useContent.ts\n3. CRITICAL: Find the existing screen files and REPLACE their old data imports with the new useContent hooks.\n4. Update the screen rendering to use the new data shape\n\nContent manifest:\n${JSON.stringify(this.input.content, null, 2)}`,
      screens: `Customize screens at ${appDir}/packages/shared-ui/src/screens/ per the AppSpec. Only rename or modify EXISTING screen files. Do NOT import screens that don't exist.`,
      navigation: `Update navigation at ${appDir}/packages/shared-ui/src/navigation/. Navigation type: ${this.state.spec?.navigation.type}. Routes: ${JSON.stringify(this.state.spec?.navigation.routes)}`,
      verify: `Run type checking at ${appDir}: npx tsc --noEmit. Fix any errors.`,
      build_loop: `Build the app at ${appDir} for platforms: ${this.state.config.platforms.join(", ")}. Use expo prebuild for iOS/Android.`,
      vega_build_loop: `Build the Vega OS variant at ${appDir}/apps/vega.`,
      visual_smoke_test: `Verify build artifacts exist at ${appDir} and capture screenshots from any running simulators.`,
    };

    return messages[phase] ?? `Execute phase: ${phase}`;
  }

  private writeReport(): void {
    writeRunReport({
      outDir: this.state.workdir,
      runId: this.state.runId,
      mode: "Strands Agent SDK",
      platforms: this.state.config.platforms,
      templateRepo: this.harness.template.repo,
      tokensUsed: this.state.tokensUsed,
      tokenBudget: this.state.tokenBudget,
      totalCost: [...this.phaseCosts.values()].reduce((sum, c) => sum + c, 0),
      phaseResults: this.state.phaseResults,
      phaseCosts: this.phaseCosts,
      spec: this.state.spec,
      brand: this.input.brand,
    });
  }

  getState(): SessionState {
    return this.state;
  }
}
