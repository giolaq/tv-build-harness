import { execSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:net";
import type {
  AppSpec,
  BrandKit,
  ContentManifest,
  DesignTokens,
  Phase,
  PhaseResult,
  RunConfig,
  SessionState,
} from "./types.js";
import { AppSpecSchema, ScreenTreeSchema } from "./types.js";
import type { ScreenTree } from "./types.js";
import { SkillLibrary } from "./skill-library.js";
import { RunLog } from "./run-log.js";
import { generateScreenshotReport } from "./screenshot-report.js";
import { PromptLoader } from "./prompt-loader.js";
import { DEFAULT_HARNESS_CONFIG } from "./harness-config.js";
import type { HarnessConfig, PhaseSpec } from "./harness-config.js";
import { runPipeline, selectActivePhases } from "./pipeline-engine.js";
import { runVerifyChecks } from "./verification.js";
import { saveCheckpoint, loadCheckpoint } from "./checkpoint.js";
import { invokeClaude, claudeEnv, ClaudeCliError } from "./claude-cli.js";

interface HarnessInput {
  prompt: string;
  content: ContentManifest;
  brand: BrandKit;
  config: RunConfig;
  design: DesignTokens;
  screenTree?: ScreenTree;
  workdir: string;
  skillsDir: string;
  harness?: HarnessConfig;
}

export interface RunOptions {
  generateOnly?: boolean;
  fromPhase?: string;
}

interface QADefect {
  screen: string;
  issue: string;
  element: string;
  file: string;
  fix: string;
}

interface QAVerdict {
  status: "pass" | "fail";
  criticalCount: number;
  majorCount: number;
  minorCount: number;
  critical: QADefect[];
  major: QADefect[];
  minor: QADefect[];
  scores: Record<string, number>;
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
  private prompts: PromptLoader;
  private webServer?: ChildProcess;
  private resumedPhases: Set<string> = new Set();
  // Resolved by the engine at run start; checkpoints are built from this.
  private effectiveCompleted: Set<string> = new Set();
  // Last verification failure per phase — fed back into the next attempt's prompt.
  private lastVerifyError: Map<string, string> = new Map();

  constructor(input: HarnessInput, events: HarnessEvents = {}) {
    this.skills = new SkillLibrary(input.skillsDir);
    this.input = input;
    this.events = events;
    this.harness = input.harness ?? DEFAULT_HARNESS_CONFIG;

    const builtinPrompts = join(import.meta.dirname ?? __dirname, "..", "prompts");
    // Project-local prompts/ take precedence so custom phases (and overrides
    // of built-in phase prompts) need no source changes.
    this.prompts = new PromptLoader([join(input.workdir, "prompts"), builtinPrompts]);

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
      tokenBudget: this.harness.tokenBudget,
      tokensUsed: 0,
      messages: [],
    };
  }

  static fromExistingRun(outDir: string, input: HarnessInput, events: HarnessEvents = {}): ClaudeOrchestrator {
    const instance = new ClaudeOrchestrator(input, events);
    instance.state.workdir = outDir;
    instance.state.runId = outDir.split("/").pop() ?? "rerun";

    const specPath = join(outDir, "spec.json");
    if (existsSync(specPath)) {
      instance.state.spec = JSON.parse(readFileSync(specPath, "utf-8"));
    }

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
    return { state: this.state, outDir: this.state.workdir };
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

    const skillContext = this.buildSkillContext(spec);

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
        vars: this.buildVerifyVars(),
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

  private buildVerifyVars(): Record<string, string> {
    return {
      "brand.primary_color": this.input.brand.primary_color,
      "brand.accent_color": this.input.brand.accent_color,
      "brand.background_color": this.input.brand.background_color,
      "brand.name": this.input.brand.name,
      "content.title": this.input.content.title,
      "app.name": this.state.spec?.app_name ?? this.input.content.title,
    };
  }

  private getPhaseInstructions(phaseSpec: PhaseSpec): string | null {
    const appDir = join(this.state.workdir, "app");
    const spec = this.state.spec;
    const phase = phaseSpec.prompt ?? phaseSpec.name;

    switch (phase) {
      case "scaffold":
        return this.prompts.load("scaffold", {
          appDir,
          appName: spec?.app_name ?? this.input.content.title,
          templateRepo: this.harness.template.repo,
          templateBranch: this.harness.template.branch ? ` --branch ${this.harness.template.branch}` : "",
        });

      case "branding": {
        const appName = spec?.app_name ?? this.input.content.title;
        const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const bundleId = "com.tvharness." + appName.toLowerCase().replace(/[^a-z0-9]/g, "");
        return this.prompts.load("branding", {
          appDir,
          appName,
          slug,
          bundleId,
          primaryColor: this.input.brand.primary_color,
          accentColor: this.input.brand.accent_color,
          backgroundColor: this.input.brand.background_color,
          fontFamily: this.input.brand.font_family || "System (no change needed)",
        });
      }

      case "content":
        return this.prompts.load("content", {
          appDir,
          contentManifest: JSON.stringify(this.input.content, null, 2),
          featuredIds: JSON.stringify(this.input.content.featured),
          categoryNames: JSON.stringify(this.input.content.categories.map(c => c.name)),
          videoCount: String(this.input.content.videos.length),
          contentTitle: this.input.content.title,
        });

      case "screens": {
        if (!spec) return "No AppSpec available. Skip this phase.";
        const screensList = spec.screens.map(s =>
          `- ${s.id}: layout="${s.layout}", route="${s.route}"${s.uses_template_screen ? `, reuses="${s.uses_template_screen}"` : ""}`
        ).join("\n");
        const navType = spec.navigation.type;
        const isDrawer = navType === "drawer";
        return this.prompts.load("screens", {
          appDir,
          screensList,
          hasDrawer: isDrawer ? "true" : "",
          noDrawer: isDrawer ? "" : "true",
        });
      }

      case "navigation": {
        if (!spec) return "No AppSpec available. Skip this phase.";
        const navType = spec.navigation.type;
        const navStyle = this.input.design.navigation_style;
        const resolvedType = navStyle === "hidden" ? "hidden" : navType;

        const routesList = spec.navigation.routes.map(r =>
          `- id="${r.id}", label="${r.label}"${r.icon ? `, icon="${r.icon}"` : ""}`
        ).join("\n");

        const typeInstructions: Record<string, string> = {
          drawer: `
The template already uses a drawer navigator. Keep it. Update the drawer items to match these routes.
Edit the DrawerNavigator file to:
- Map each route to its screen component
- Set the correct labels and icons
- Remove any routes not in the list above
- KEEP any existing focus trapping logic (SpatialNavigationNode with captureFocus) in the drawer content`,

          tabs: `
The template uses a drawer navigator — you MUST REPLACE it with a top tab bar.

IMPORTANT: Do NOT install @react-navigation/bottom-tabs or @react-navigation/material-top-tabs. These packages have version conflicts with the template's @react-navigation/native and WILL crash with "createScreenFactory is not a function".

Instead, implement tabs using the EXISTING drawer navigator infrastructure with a CUSTOM top tab bar:

Steps:
1. Keep the drawer navigator but set drawerType: 'permanent' and drawerStyle: { width: 0, height: 0 } (invisible drawer)
   OR replace the drawer with a simple Stack navigator that renders a custom top tab bar + screen content
2. Create a custom TopTabBar component at packages/shared-ui/src/components/TopTabBar.tsx:
   - Renders a horizontal row of tab items at the top of the screen
   - Each tab is a SpatialNavigationFocusableView (for D-pad navigation)
   - Active tab is highlighted with accent color
   - Use SpatialNavigationNode with orientation="horizontal" to wrap the tab row
   - Tab labels must be scaledPixels(22) minimum for TV readability
3. The TopTabBar receives the current route and an onTabPress callback
4. Wrap screens in a View with the TopTabBar at top and screen content below:
   <View style={{flex:1}}>
     <TopTabBar routes={routes} activeRoute={currentRoute} onTabPress={navigate} />
     <View style={{flex:1}}>{/* screen content */}</View>
   </View>
5. Remove the drawer-related imports, CustomDrawerContent component, and MenuContext/MenuProvider (not needed for tabs)
6. Remove any menu toggle buttons or hamburger icons
7. Since there is no drawer, screens do NOT need isMenuOpen — just use isActive={isFocused} with useIsFocused()`,

          hidden: `
The template uses a drawer navigator — you MUST REMOVE visible navigation chrome.

Steps for hidden navigation:
1. Find the DrawerNavigator file
2. Replace it with a simple Stack navigator (no visible tabs or drawer)
3. The user navigates between screens via content interaction only (tapping tiles navigates to detail/player)
4. Keep a root stack with all screens registered, but no visible navigation bar
5. Remove drawer toggle buttons, hamburger icons, and the CustomDrawerContent component
6. The home screen is the entry point — other screens are reached by selecting content items`,
        };

        const instructions = typeInstructions[resolvedType] ?? typeInstructions["drawer"];

        return this.prompts.load("navigation", {
          appDir,
          resolvedType,
          routesList,
          typeInstructions: instructions,
        });
      }

      case "verify": {
        const isDrawerNav = spec?.navigation.type === "drawer";
        return this.prompts.load("verify", {
          appDir,
          hasDrawer: isDrawerNav ? "true" : "",
          noDrawer: isDrawerNav ? "" : "true",
        });
      }

      case "build_loop": {
        const platforms = this.input.config.platforms;
        const wantsAndroid = platforms.includes("androidtv") || platforms.includes("firetv-fos");
        const wantsIos = platforms.includes("appletv");
        return this.prompts.load("build_loop", {
          appDir,
          platforms: platforms.join(", "),
          wantsAndroid: wantsAndroid ? "true" : "",
          wantsIos: wantsIos ? "true" : "",
          iosStepNumber: wantsAndroid ? "4" : "3",
        });
      }

      case "vega_build_loop":
        return this.prompts.load("vega_build_loop", {
          appDir,
        });

      case "visual_correctness": {
        const brand = this.input.brand;
        const design = this.input.design;
        const screenshotDir = `${this.state.workdir}/screenshots`;
        const routes = spec?.navigation.routes ?? [];
        const routeCount = routes.length;
        return this.prompts.load("visual_correctness", {
          appDir,
          outDir: this.state.workdir,
          screenshotDir,
          primaryColor: brand.primary_color,
          accentColor: brand.accent_color,
          backgroundColor: brand.background_color,
          navigationStyle: design.navigation_style,
          template: design.template,
          heroExpected: design.show_hero ? "EXPECTED" : "SHOULD BE HIDDEN",
          tileSize: design.tile_size,
          maxScreensToVisit: String(Math.min(routeCount, 4)),
        });
      }

      case "visual_smoke_test": {
        const routes = spec?.navigation.routes ?? [];
        const routeNames = routes.map(r => r.id).join(", ");
        return this.prompts.load("visual_smoke_test", {
          appDir,
          outDir: this.state.workdir,
          screenshotDir: `${this.state.workdir}/screenshots`,
          appName: spec?.app_name ?? "App",
          routeNames,
        });
      }

      default: {
        // Custom config-defined phases: load their prompt file with the
        // generic variable bag. No prompt file → no instructions.
        try {
          return this.prompts.load(phase, {
            appDir,
            outDir: this.state.workdir,
            appName: spec?.app_name ?? this.input.content.title,
            primaryColor: this.input.brand.primary_color,
            accentColor: this.input.brand.accent_color,
            backgroundColor: this.input.brand.background_color,
            contentTitle: this.input.content.title,
            platforms: this.input.config.platforms.join(", "),
            templateRepo: this.harness.template.repo,
          });
        } catch {
          return null;
        }
      }
    }
  }

  private async executePlanPhase(): Promise<PhaseResult> {
    const navStyle = this.input.design.navigation_style;
    const navTypeConstraint = navStyle === "hidden" ? "single" : navStyle === "tabs" ? "tabs" : "drawer";

    let screenTreeSection = "";
    if (this.input.screenTree) {
      const st = this.input.screenTree;
      const screenLines = st.screens.map(s =>
        `  - ${s.name} (layout: ${s.layout}${s.data_source ? `, data: ${s.data_source}` : ""}${s.icon ? `, icon: ${s.icon}` : ""}${s.children?.length ? `, children: [${s.children.map(c => `${c.name}(${c.layout})`).join(", ")}]` : ""})`
      ).join("\n");
      const allScreenNames = [st.home, ...st.screens].map(s => s.name).join(", ");

      screenTreeSection = `
SCREEN TREE (developer-specified — you MUST follow this exactly):
Navigation type: ${st.navigation_type}
Home screen: ${st.home.name} (layout: ${st.home.layout})
Sibling screens (${st.navigation_type === "drawer" ? "drawer items" : "tab items"}):
${screenLines}

The navigation.routes MUST include exactly these screens: [${allScreenNames}]
The screens array MUST include all screens from the tree plus any child screens.
Each screen's layout MUST match what is specified above. Do NOT change layouts.`;
    }

    const planPrompt = this.prompts.load("plan", {
      navTypeConstraint,
      screenTreeSection,
      brief: this.input.prompt,
      contentSummary: `${this.input.content.categories.length} categories, ${this.input.content.videos.length} videos, ${this.input.content.featured.length} featured`,
      brandName: this.input.brand.name,
      primaryColor: this.input.brand.primary_color,
      accentColor: this.input.brand.accent_color,
      backgroundColor: this.input.brand.background_color,
      template: this.input.design.template,
      navStyle,
      heroVisibility: this.input.design.show_hero ? "visible" : "hidden",
      tileSize: this.input.design.tile_size,
    });

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

      writeFileSync(
        join(this.state.workdir, "spec.json"),
        JSON.stringify(this.state.spec, null, 2)
      );

      return { phase: "plan", status: "success", iterations: 1 };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { phase: "plan", status: "failed", iterations: 1, error: message };
    }
  }

  private async executeVisualQALoop(): Promise<PhaseResult> {
    const maxIterations = this.input.config.visual_qa_max_iterations ?? 3;
    const threshold = this.input.config.visual_qa_pass_threshold ?? "normal";
    const appDir = join(this.state.workdir, "app");
    const screenshotDir = join(this.state.workdir, "screenshots");
    const port = await this.getFreePort(19007);

    mkdirSync(screenshotDir, { recursive: true });

    try {
      await this.startWebServer(appDir, port);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { phase: "visual_qa_loop", status: "failed", iterations: 0, error: `Web server failed: ${msg}` };
    }

    let lastVerdict: QAVerdict | null = null;

    for (let iter = 1; iter <= maxIterations; iter++) {
      this.events.onIteration?.("visual_qa_loop", iter, maxIterations);
      this.events.onLog?.(`Visual QA iteration ${iter}/${maxIterations}`);

      // Step A: Capture screenshots
      const capturePrompt = this.buildCapturePrompt(appDir, screenshotDir, port, iter);
      writeFileSync(join(this.state.workdir, `visual-qa-capture-${iter}.md`), capturePrompt);

      try {
        await this.runClaude(capturePrompt, appDir, 300_000);
      } catch (err) {
        this.events.onLog?.(`Capture failed iter ${iter}: ${err instanceof Error ? err.message : err}`);
        continue;
      }

      // Step B: Analyze screenshots
      const analysisPrompt = this.buildAnalysisPrompt(appDir, screenshotDir, iter);
      writeFileSync(join(this.state.workdir, `visual-qa-analysis-${iter}.md`), analysisPrompt);

      let analysisResult: string;
      try {
        analysisResult = await this.runClaude(analysisPrompt, appDir, 600_000);
      } catch (err) {
        this.events.onLog?.(`Analysis failed iter ${iter}: ${err instanceof Error ? err.message : err}`);
        continue;
      }

      writeFileSync(join(this.state.workdir, `visual-qa-result-${iter}.txt`), analysisResult);

      // Step C: Parse verdict
      lastVerdict = this.parseQAVerdict(analysisResult);
      writeFileSync(
        join(this.state.workdir, `visual-qa-verdict-${iter}.json`),
        JSON.stringify(lastVerdict, null, 2)
      );

      const passes = threshold === "strict"
        ? lastVerdict.criticalCount === 0 && lastVerdict.majorCount === 0
        : lastVerdict.criticalCount === 0;

      this.events.onLog?.(
        `Iter ${iter}: ${lastVerdict.criticalCount} critical, ${lastVerdict.majorCount} major, ${lastVerdict.minorCount} minor`
      );

      if (passes) {
        await this.stopWebServer(port);
        this.writeQAReport(lastVerdict, iter);
        return { phase: "visual_qa_loop", status: "success", iterations: iter };
      }

      if (iter === maxIterations) {
        break;
      }

      // Step D: Fix defects
      const fixPrompt = this.buildFixPrompt(lastVerdict, appDir);
      writeFileSync(join(this.state.workdir, `visual-qa-fix-${iter}.md`), fixPrompt);

      try {
        await this.runClaude(fixPrompt, appDir, 600_000);
      } catch (err) {
        this.events.onLog?.(`Fix failed iter ${iter}: ${err instanceof Error ? err.message : err}`);
      }

      // Wait for hot-reload
      await new Promise(r => setTimeout(r, 3000));
    }

    await this.stopWebServer(port);
    this.writeQAReport(lastVerdict, maxIterations);

    const errorMsg = lastVerdict
      ? `${lastVerdict.criticalCount} critical, ${lastVerdict.majorCount} major defects remain after ${maxIterations} iterations`
      : "Visual QA loop failed to produce results";

    return {
      phase: "visual_qa_loop",
      status: lastVerdict && lastVerdict.criticalCount === 0 ? "degraded" : "failed",
      iterations: maxIterations,
      error: errorMsg,
    };
  }

  private async startWebServer(appDir: string, port: number): Promise<void> {
    const expoDir = join(appDir, "apps", "expo-multi-tv");

    // Clear Metro's temp cache to avoid stale lockfiles
    try {
      execSync(`rm -rf "${join(expoDir, "node_modules", ".cache", "metro")}" 2>/dev/null || true`, { stdio: "pipe" });
    } catch {}

    const child = spawn("npx", ["expo", "start", "--web", "--port", String(port)], {
      cwd: expoDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...claudeEnv(), BROWSER: "none", EXPO_TV: "1" },
      detached: true,
    });

    // Drain stdout/stderr so the child process doesn't block on full pipes
    let serverOutput = "";
    child.stdout?.on("data", (chunk: Buffer) => { serverOutput += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { serverOutput += chunk.toString(); });
    child.on("exit", (code) => {
      if (code && code !== 0) {
        this.events.onLog?.(`Expo server exited with code ${code}: ${serverOutput.slice(-200)}`);
      }
    });
    child.unref();
    this.webServer = child;

    // Phase 1: Wait for server to respond at all
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        execSync(`curl -s http://localhost:${port} > /dev/null`, { timeout: 5000, stdio: "pipe" });
        break;
      } catch {
        if (i === 29) {
          const hint = serverOutput.slice(-300);
          throw new Error(`Web server not ready after 60s on port ${port}. Server output: ${hint}`);
        }
      }
    }

    // Phase 2: Wait for the JS bundle to compile (Expo compiles on first request)
    // The first curl triggers compilation; we need to wait for it to finish
    this.events.onLog?.("Web server responding, waiting for JS bundle compilation...");
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const body = execSync(`curl -s http://localhost:${port}`, { timeout: 10000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
        // Check if the response contains the bundled script (not just the HTML shell)
        if (body.includes("bundle.js") || body.includes("AppEntry") || body.length > 2000) {
          // Give it a few more seconds for the client to hydrate
          await new Promise(r => setTimeout(r, 5000));
          return;
        }
      } catch {}
    }
    // If we get here, server is up but bundle may still be compiling — proceed anyway
    this.events.onLog?.("Bundle compilation timeout — proceeding with screenshots");
  }

  private async stopWebServer(port: number): Promise<void> {
    const child = this.webServer;
    this.webServer = undefined;
    if (!child || child.killed) return;

    try {
      if (child.pid) {
        process.kill(-child.pid, "SIGTERM");
      } else {
        child.kill("SIGTERM");
      }
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {}
    }
  }

  private getFreePort(preferred: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.once("error", () => {
        const fallback = createServer();
        fallback.once("error", reject);
        fallback.listen(0, () => {
          const address = fallback.address();
          const port = typeof address === "object" && address ? address.port : preferred;
          fallback.close(() => resolve(port));
        });
      });
      server.listen(preferred, () => {
        server.close(() => resolve(preferred));
      });
    });
  }

  private buildCapturePrompt(appDir: string, screenshotDir: string, port: number, iter: number): string {
    const routes = this.state.spec?.navigation.routes ?? [];
    const routeCount = Math.min(routes.length, 4);
    const iterDir = join(screenshotDir, `iter-${iter}`);

    return this.prompts.load("visual_qa_capture", {
      iterDir,
      workdir: this.state.workdir,
      iter: String(iter),
      port: String(port),
      routeCount: String(routeCount),
    });
  }

  private buildAnalysisPrompt(appDir: string, screenshotDir: string, iter: number): string {
    const iterDir = join(screenshotDir, `iter-${iter}`);
    const brand = this.input.brand;
    const design = this.input.design;

    return this.prompts.load("visual_qa_analysis", {
      iterDir,
      primaryColor: brand.primary_color,
      accentColor: brand.accent_color,
      backgroundColor: brand.background_color,
      template: design.template,
      focusStyle: design.focus_style,
      verdictExtra: this.input.config.visual_qa_pass_threshold === "strict" ? " AND majorDefects is empty" : "",
    });
  }

  private buildFixPrompt(verdict: QAVerdict, appDir: string): string {
    const defects = [...verdict.critical, ...verdict.major];
    const defectList = defects.map((d, i) =>
      `${i + 1}. [${d.screen}] ${d.issue}\n   Element: ${d.element}\n   File: ${d.file}\n   Suggested fix: ${d.fix}`
    ).join("\n\n");

    return this.prompts.load("visual_qa_fix", {
      defectCount: String(defects.length),
      defectList,
      appDir,
    });
  }

  private parseQAVerdict(output: string): QAVerdict {
    try {
      // If output is the raw CLI wrapper, extract the result field first
      let text = output;
      if (text.startsWith('{"type":"result"')) {
        try {
          const wrapper = JSON.parse(text);
          text = wrapper.result ?? text;
        } catch {}
      }

      // Find JSON block containing "verdict" key (the model's analysis output)
      const jsonBlocks = text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) ?? [];
      let parsed: Record<string, unknown> | null = null;
      for (const block of jsonBlocks) {
        try {
          const candidate = JSON.parse(block);
          if (candidate.verdict || candidate.criticalDefects) {
            parsed = candidate;
            break;
          }
        } catch {}
      }

      // Fallback: try the largest JSON block
      if (!parsed) {
        const bigMatch = text.match(/```json\s*([\s\S]*?)```/);
        if (bigMatch) {
          parsed = JSON.parse(bigMatch[1]);
        }
      }

      if (!parsed) {
        const fallback = text.match(/\{[\s\S]*\}/);
        if (fallback) parsed = JSON.parse(fallback[0]);
      }

      if (!parsed) {
        return { status: "pass", criticalCount: 0, majorCount: 0, minorCount: 0, critical: [], major: [], minor: [], scores: {} };
      }
      const data = parsed as Record<string, unknown>;
      const criticalArr = Array.isArray(data.criticalDefects) ? data.criticalDefects : [];
      const majorArr = Array.isArray(data.majorDefects) ? data.majorDefects : [];
      const minorArr = Array.isArray(data.minorDefects) ? data.minorDefects : [];

      const critical: QADefect[] = criticalArr.map((d: Record<string, string>) => ({
        screen: d.screen ?? "", issue: d.issue ?? "", element: d.element ?? "", file: d.file ?? "", fix: d.fix ?? "",
      }));
      const major: QADefect[] = majorArr.map((d: Record<string, string>) => ({
        screen: d.screen ?? "", issue: d.issue ?? "", element: d.element ?? "", file: d.file ?? "", fix: d.fix ?? "",
      }));
      const minor: QADefect[] = minorArr.map((d: Record<string, string>) => ({
        screen: d.screen ?? "", issue: d.issue ?? "", element: d.element ?? "", file: d.file ?? "", fix: d.fix ?? "",
      }));
      return {
        status: data.verdict === "pass" ? "pass" : "fail",
        criticalCount: critical.length,
        majorCount: major.length,
        minorCount: minor.length,
        critical, major, minor,
        scores: (data.scores as Record<string, number>) ?? {},
      };
    } catch {
      return { status: "fail", criticalCount: 1, majorCount: 0, minorCount: 0, critical: [], major: [], minor: [], scores: {} };
    }
  }

  private writeQAReport(verdict: QAVerdict | null, iterations: number): void {
    const routes = this.state.spec?.navigation.routes ?? [];
    const platforms = this.input.config.platforms;

    const lines = [
      "# Visual QA Report",
      "",
      `**App:** ${this.state.spec?.app_name ?? "Unknown"}`,
      `**Platforms:** ${platforms.join(", ")}`,
      `**Navigation:** ${this.state.spec?.navigation.type ?? "unknown"} (${routes.length} routes)`,
      `**Iterations:** ${iterations}`,
      `**Verdict:** ${verdict?.status ?? "unknown"}`,
      "",
      "## Defect Summary",
      "",
      `| Severity | Count |`,
      `|----------|-------|`,
      `| Critical | ${verdict?.criticalCount ?? "?"} |`,
      `| Major    | ${verdict?.majorCount ?? "?"} |`,
      `| Minor    | ${verdict?.minorCount ?? "?"} |`,
      "",
    ];

    if (verdict?.scores && Object.keys(verdict.scores).length > 0) {
      lines.push("## 10ft UI Scores", "");
      lines.push("| Dimension | Score |");
      lines.push("|-----------|-------|");
      for (const [key, val] of Object.entries(verdict.scores)) {
        const icon = val >= 8 ? "+" : val >= 5 ? "~" : "-";
        lines.push(`| ${icon} ${key} | ${val}/10 |`);
      }
      lines.push("");
    }

    if (verdict?.critical.length) {
      lines.push("## Critical Defects (must fix)", "");
      for (const d of verdict.critical) {
        lines.push(`- **[${d.screen}]** ${d.issue}`);
        lines.push(`  File: \`${d.file}\` | Fix: ${d.fix}`);
      }
      lines.push("");
    }

    if (verdict?.major.length) {
      lines.push("## Major Defects", "");
      for (const d of verdict.major) {
        lines.push(`- **[${d.screen}]** ${d.issue}`);
        lines.push(`  File: \`${d.file}\` | Fix: ${d.fix}`);
      }
      lines.push("");
    }

    if (verdict?.minor.length) {
      lines.push("## Minor Defects", "");
      for (const d of verdict.minor) {
        lines.push(`- [${d.screen}] ${d.issue}`);
      }
      lines.push("");
    }

    lines.push("## Route Coverage", "");
    for (const route of routes) {
      lines.push(`- ${route.label} (/${route.id})`);
    }
    lines.push("");

    lines.push("## Ship Readiness", "");
    if (verdict?.status === "pass") {
      lines.push("**READY TO SHIP** — Zero critical defects. All 10ft UI rules pass.");
    } else if (verdict && verdict.criticalCount === 0) {
      lines.push("**SHIP WITH CAUTION** — No critical defects, but major issues remain.");
    } else {
      lines.push("**NOT READY** — Critical defects remain. Fix before shipping.");
    }
    lines.push("");

    writeFileSync(join(this.state.workdir, "visual-qa-report.md"), lines.join("\n"));
  }

  private buildSkillContext(spec: PhaseSpec): string {
    const meta = this.skills.alwaysLoad();
    const phaseSkills = this.skills.loadSkills(spec.skills);

    const parts = [
      "## Context: You are a TV app development agent.",
      "",
      "## App Spec",
      JSON.stringify(this.state.spec, null, 2),
      "",
      "## Design System",
      this.buildDesignContext(),
      "",
      "## Skills (domain knowledge for this phase)",
      meta,
      ...phaseSkills,
    ];

    return parts.join("\n");
  }

  private buildDesignContext(): string {
    const d = this.input.design;
    const templateDescriptions: Record<string, string> = {
      "netflix-style": "Large hero banner at top, horizontal content rails below. Immersive, content-forward.",
      "grid-first": "No hero banner. Full-screen grid of tiles. Content density is the priority.",
      "spotlight": "Single focused item takes 60% of screen. Minimal surrounding UI. Cinematic feel.",
      "minimal": "Clean, lots of whitespace. Small tiles, subtle animations. Typography-driven.",
      "classic": "Standard TV app layout. Left-side navigation, content area on right.",
    };

    return [
      `Template: "${d.template}" — ${templateDescriptions[d.template] ?? "standard layout"}`,
      `Hero: ${d.show_hero ? `visible, ${d.hero_height}px` : "hidden"}`,
      `Tiles: ${d.tile_size}, ${d.tile_ratio}, ${d.corner_radius}px radius`,
      `Spacing: ${d.spacing} | Rails: ${d.rails_per_screen} | Font scale: ${d.font_scale}x`,
      `Navigation: ${d.navigation_style} | Focus: ${d.focus_style} | Animation: ${d.animation_speed}`,
      `Show descriptions: ${d.show_descriptions} | Show duration: ${d.show_duration}`,
    ].join("\n");
  }

  private commitAfterPhase(phase: Phase): void {
    const appDir = join(this.state.workdir, "app");
    if (!existsSync(join(appDir, ".git"))) return;

    try {
      const status = execSync("git status --porcelain", {
        cwd: appDir,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      if (!status.trim()) return;

      execSync("git add -A", { cwd: appDir, stdio: ["pipe", "pipe", "pipe"] });
      execSync(`git commit -m "harness: complete phase ${phase}"`, {
        cwd: appDir,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      // non-fatal — commit is best-effort
    }
  }

  private writeReport(): void {
    const lines: string[] = [
      `# Run Report`,
      ``,
      `**Run ID:** ${this.state.runId}`,
      `**Date:** ${new Date().toISOString()}`,
      `**App:** ${this.state.spec?.app_name ?? "Unknown"}`,
      `**Platforms:** ${this.state.config.platforms.join(", ")}`,
      `**Mode:** claude-run (CLI subprocess)`,
      `**Template:** ${this.harness.template.repo}`,
      ``,
      `## Token Usage`,
      ``,
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Total tokens | ${this.state.tokensUsed.toLocaleString()} |`,
      `| Budget | ${this.state.tokenBudget.toLocaleString()} |`,
      `| Utilization | ${Math.round((this.state.tokensUsed / this.state.tokenBudget) * 100)}% |`,
      `| Total cost | $${this.totalCost.toFixed(4)} |`,
      ``,
      `## Phases`,
      ``,
      `| Phase | Status | Iterations |`,
      `|-------|--------|------------|`,
    ];

    for (const [phase, result] of this.state.phaseResults) {
      const icon = result.status === "success" ? "✓" : result.status === "degraded" ? "~" : "✗";
      lines.push(`| ${icon} ${phase} | ${result.status} | ${result.iterations} |`);
      if (result.error) {
        lines.push(`| | Error: ${result.error.slice(0, 100)} | |`);
      }
    }

    const succeeded = [...this.state.phaseResults.values()].filter(r => r.status === "success").length;
    const total = this.state.phaseResults.size;
    lines.push("");
    lines.push(`**Result:** ${succeeded}/${total} phases succeeded`);

    lines.push("");
    lines.push("## AppSpec Summary");
    lines.push("");
    if (this.state.spec) {
      lines.push(`- **Navigation:** ${this.state.spec.navigation.type}`);
      lines.push(`- **Screens:** ${this.state.spec.screens.map(s => s.id).join(", ")}`);
      lines.push(`- **Theme mode:** ${this.state.spec.theme.mode}`);
      lines.push(`- **Brand:** ${this.input.brand.name} (${this.input.brand.primary_color} / ${this.input.brand.accent_color})`);
    } else {
      lines.push("*Plan phase failed — no AppSpec generated.*");
    }

    lines.push("");
    lines.push("## Artifacts");
    lines.push("");
    lines.push("- `spec.json` — Planner output");
    lines.push("- `run.log` — NDJSON audit trail");
    lines.push("- `app/` — Generated application source");

    const screenshotReportPath = generateScreenshotReport(
      this.state.workdir,
      this.state.spec?.app_name ?? "TV App"
    );
    if (screenshotReportPath) {
      lines.push("- `screenshots.html` — Visual comparison report");
    }

    lines.push("");

    writeFileSync(join(this.state.workdir, "report.md"), lines.join("\n"));
  }

  private async runClaude(prompt: string, cwd: string, timeoutMs?: number, model?: string): Promise<string> {
    const phase = this.state.currentPhase;
    try {
      const result = await invokeClaude({
        prompt,
        cwd,
        timeoutMs,
        model,
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
      this.lastPhaseCost = result.costUsd;
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
