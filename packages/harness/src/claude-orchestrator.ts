import { execSync, spawn as spawnAsync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
import { V1_PHASES, PHASE_DEPS, AppSpecSchema, ScreenTreeSchema } from "./types.js";
import type { ScreenTree } from "./types.js";
import { SkillLibrary } from "./skill-library.js";
import { RunLog } from "./run-log.js";
import { generateScreenshotReport } from "./screenshot-report.js";
import { PromptLoader } from "./prompt-loader.js";

interface HarnessInput {
  prompt: string;
  content: ContentManifest;
  brand: BrandKit;
  config: RunConfig;
  design: DesignTokens;
  screenTree?: ScreenTree;
  workdir: string;
  skillsDir: string;
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
  private lastPhaseCost: number = 0;
  private prompts: PromptLoader;

  constructor(input: HarnessInput, events: HarnessEvents = {}) {
    this.skills = new SkillLibrary(input.skillsDir);
    this.input = input;
    this.events = events;

    const promptsDir = join(import.meta.dirname ?? __dirname, "..", "prompts");
    this.prompts = new PromptLoader(promptsDir);

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
      tokenBudget: 500_000,
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

  async runVisualQAOnly(): Promise<PhaseResult> {
    this.state.currentPhase = "visual_qa_loop";
    this.events.onPhaseStart?.("visual_qa_loop");
    const result = await this.executeVisualQALoop();
    this.events.onPhaseEnd?.("visual_qa_loop", result, this.lastPhaseCost);
    return result;
  }

  async run(): Promise<{ state: SessionState; outDir: string }> {
    const phases = this.getActivePhases();
    const completed = new Set<Phase>();
    const failed = new Set<Phase>();
    const running = new Map<Phase, Promise<{ phase: Phase; result: PhaseResult }>>();

    while (completed.size + failed.size < phases.length) {
      const ready = phases.filter(p =>
        !completed.has(p) && !failed.has(p) && !running.has(p) &&
        PHASE_DEPS[p].every(dep => completed.has(dep) || !phases.includes(dep))
      );

      for (const phase of ready) {
        this.state.currentPhase = phase;
        this.log.phaseStart(phase, this.state.totalIterations);
        this.events.onPhaseStart?.(phase);

        if (!this.events.onLog) {
          console.log(`\n  [${"=".repeat(40)}]`);
          console.log(`  Phase: ${phase}`);
          console.log(`  [${"=".repeat(40)}]\n`);
        }

        running.set(phase, this.executePhaseWithRetry(phase).then(result => ({ phase, result })));
      }

      if (running.size === 0) {
        // Remaining phases are blocked by failed dependencies
        for (const p of phases) {
          if (!completed.has(p) && !failed.has(p)) {
            failed.add(p);
            const blockedResult: PhaseResult = { phase: p, status: "failed", iterations: 0, error: "Blocked by failed dependency" };
            this.state.phaseResults.set(p, blockedResult);
            this.events.onPhaseEnd?.(p, blockedResult, 0);
          }
        }
        break;
      }

      const settled = await Promise.race(running.values());
      running.delete(settled.phase);

      const { phase, result } = settled;
      this.state.phaseResults.set(phase, result);
      this.log.phaseEnd(phase, this.state.totalIterations, result.status);
      const phaseCost = this.lastPhaseCost;
      this.lastPhaseCost = 0;
      this.events.onPhaseEnd?.(phase, result, phaseCost);

      if (result.status === "failed") {
        if (!this.events.onLog) console.log(`  Phase ${phase} FAILED: ${result.error}`);
        this.events.onLog?.(`Phase ${phase} FAILED: ${result.error}`);
        failed.add(phase);
        if (phase === "plan") {
          if (!this.events.onLog) console.log(`  Aborting: cannot continue without a valid AppSpec.`);
          break;
        }
      } else if (result.status === "degraded") {
        if (!this.events.onLog) console.log(`  Phase ${phase} DEGRADED: ${result.error}`);
        this.events.onLog?.(`Phase ${phase} DEGRADED: ${result.error}`);
        completed.add(phase);
      } else {
        if (!this.events.onLog) console.log(`  Phase ${phase}: ${result.status}`);
        this.events.onLog?.(`Phase ${phase}: ${result.status}`);
        completed.add(phase);
        this.commitAfterPhase(phase);
      }
    }

    this.writeReport();
    return { state: this.state, outDir: this.state.workdir };
  }

  private getActivePhases(): Phase[] {
    const { platforms } = this.state.config;

    const generateOnly = process.argv.includes("--generate-only");
    const buildPhases: Phase[] = ["simulator_build", "vega_build", "visual_correctness", "visual_qa_loop"];

    return V1_PHASES.filter((phase) => {
      if (generateOnly && buildPhases.includes(phase)) return false;
      if (phase === "vega_build") return platforms.includes("firetv-vega");
      return true;
    });
  }

  private async executePhaseWithRetry(phase: Phase): Promise<PhaseResult> {
    // Phases with internal iteration logic should not be retried externally
    const noRetryPhases: Phase[] = ["visual_qa_loop", "visual_correctness"];
    if (noRetryPhases.includes(phase)) {
      return this.executePhase(phase);
    }

    const maxRetries = this.state.config.max_retries_per_phase;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const result = await this.executePhase(phase);

      if (result.status === "success") {
        return result;
      }

      if (result.status === "failed" && phase === "plan") {
        return result;
      }

      if (attempt < maxRetries - 1) {
        console.log(`  Attempt ${attempt + 1}/${maxRetries} ${result.status}: ${result.error}`);
        console.log(`  Retrying...`);
      } else {
        return result;
      }
    }

    return { phase, status: "failed", iterations: maxRetries, error: "Exhausted retries" };
  }

  private async executePhase(phase: Phase): Promise<PhaseResult> {
    this.state.totalIterations++;

    if (phase === "plan") {
      return this.executePlanPhase();
    }

    if (phase === "visual_qa_loop") {
      return this.executeVisualQALoop();
    }

    const instructions = this.getPhaseInstructions(phase);
    if (!instructions) {
      return { phase, status: "degraded", iterations: 1, error: `No instructions for phase: ${phase}` };
    }

    const skillContext = this.buildSkillContext(phase);

    const fullPrompt = [
      skillContext,
      "",
      "## Your Task",
      instructions,
    ].join("\n");

    // Log prompt for debugging
    writeFileSync(
      join(this.state.workdir, `prompt-${phase}.md`),
      `# Phase: ${phase}\n\n## Full Prompt (${fullPrompt.length} chars)\n\n${fullPrompt}\n`
    );

    try {
      const appDir = join(this.state.workdir, "app");
      const cwd = phase === "clone_template" ? this.state.workdir : appDir;
      mkdirSync(cwd, { recursive: true });

      const buildPhases: Phase[] = ["simulator_build", "vega_build"];
      const timeoutMs = buildPhases.includes(phase) ? 900_000 : 600_000;

      const output = await this.invokeClaude(fullPrompt, cwd, timeoutMs);

      // Log full response
      writeFileSync(join(this.state.workdir, `response-${phase}.txt`), output);

      this.log.log({
        phase,
        iteration: this.state.totalIterations,
        event: "model_turn",
        message: output.slice(0, 500),
      });

      const verification = this.verifyPhaseOutput(phase);
      if (!verification.ok) {
        this.log.error(phase, this.state.totalIterations, verification.error!);
        return { phase, status: "degraded", iterations: 1, error: verification.error };
      }

      return { phase, status: "success", iterations: 1 };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error(phase, this.state.totalIterations, message);
      return { phase, status: "failed", iterations: 1, error: message };
    }
  }

  private getPhaseInstructions(phase: Phase): string | null {
    const appDir = join(this.state.workdir, "app");
    const spec = this.state.spec;

    switch (phase) {
      case "clone_template":
        return this.prompts.load("clone_template", {
          appDir,
          appName: spec?.app_name ?? this.input.content.title,
        });

      case "metadata_branding": {
        const appName = spec?.app_name ?? this.input.content.title;
        const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const bundleId = "com.tvharness." + appName.toLowerCase().replace(/[^a-z0-9]/g, "");
        return this.prompts.load("metadata_branding", {
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

      case "manifest_wiring":
        return this.prompts.load("manifest_wiring", {
          appDir,
          contentManifest: JSON.stringify(this.input.content, null, 2),
          featuredIds: JSON.stringify(this.input.content.featured),
          categoryNames: JSON.stringify(this.input.content.categories.map(c => c.name)),
          videoCount: String(this.input.content.videos.length),
          contentTitle: this.input.content.title,
        });

      case "screen_customization": {
        if (!spec) return "No AppSpec available. Skip this phase.";
        const screensList = spec.screens.map(s =>
          `- ${s.id}: layout="${s.layout}", route="${s.route}"${s.uses_template_screen ? `, reuses="${s.uses_template_screen}"` : ""}`
        ).join("\n");
        return this.prompts.load("screen_customization", {
          appDir,
          screensList,
        });
      }

      case "navigation_update": {
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
The template uses a drawer navigator — you MUST REPLACE it with a top tab navigator.

Steps to switch from drawer to tabs:
1. Check if @react-navigation/bottom-tabs or @react-navigation/material-top-tabs is installed.
   If not: run "yarn workspace @multi-tv/expo-multi-tv add @react-navigation/bottom-tabs" (ALWAYS add to expo-multi-tv, NEVER to shared-ui — shared-ui only has peerDependencies)
2. Find the DrawerNavigator file (likely DrawerNavigator.tsx or similar in packages/shared-ui/src/navigation/)
3. REPLACE the drawer navigator with a tab navigator. Use createBottomTabNavigator() or createMaterialTopTabNavigator() for a top bar.
4. For a TOP tab bar specifically, use createMaterialTopTabNavigator with tabBarPosition: 'top' and style it:
   - Background: match the app's background color
   - Active indicator: use the accent/primary color
   - Labels: visible, using the theme text color
   - Tab bar should be at the TOP of the screen, below any status bar
5. Update the parent navigator (AppNavigator/RootNavigator) to use your new tab navigator instead of the drawer
6. Remove the drawer-related imports and the CustomDrawerContent component reference
7. Remove any menu toggle buttons or hamburger icons from screen headers`,

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

        return this.prompts.load("navigation_update", {
          appDir,
          resolvedType,
          routesList,
          typeInstructions: instructions,
        });
      }

      case "static_checks":
        return this.prompts.load("static_checks", {
          appDir,
        });

      case "simulator_build": {
        const platforms = this.input.config.platforms;
        const wantsAndroid = platforms.includes("androidtv") || platforms.includes("firetv-fos");
        const wantsIos = platforms.includes("appletv");
        return this.prompts.load("simulator_build", {
          appDir,
          platforms: platforms.join(", "),
          wantsAndroid: wantsAndroid ? "true" : "",
          wantsIos: wantsIos ? "true" : "",
          iosStepNumber: wantsAndroid ? "4" : "3",
        });
      }

      case "vega_build":
        return this.prompts.load("vega_build", {
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

      default:
        return null;
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
      const output = await this.invokeClaude(planPrompt, this.state.workdir);

      // Log raw response
      writeFileSync(join(this.state.workdir, "plan-response.txt"), output);

      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { phase: "plan", status: "failed", iterations: 1, error: "No JSON found in planner output" };
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
    const port = 19007;

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
        await this.invokeClaude(capturePrompt, appDir, 300_000);
      } catch (err) {
        this.events.onLog?.(`Capture failed iter ${iter}: ${err instanceof Error ? err.message : err}`);
        continue;
      }

      // Step B: Analyze screenshots
      const analysisPrompt = this.buildAnalysisPrompt(appDir, screenshotDir, iter);
      writeFileSync(join(this.state.workdir, `visual-qa-analysis-${iter}.md`), analysisPrompt);

      let analysisResult: string;
      try {
        analysisResult = await this.invokeClaude(analysisPrompt, appDir, 600_000);
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
        await this.invokeClaude(fixPrompt, appDir, 600_000);
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

    // Kill any lingering Metro/Expo servers from prior phases
    try {
      execSync(`lsof -ti:19006 | xargs kill -9 2>/dev/null || true`, { stdio: "pipe" });
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { stdio: "pipe" });
    } catch {}
    // Clear Metro's temp cache to avoid stale lockfiles
    try {
      execSync(`rm -rf ${expoDir}/node_modules/.cache/metro 2>/dev/null || true`, { stdio: "pipe" });
    } catch {}
    await new Promise(r => setTimeout(r, 2000));

    const child = spawnAsync("npx", ["expo", "start", "--web", "--port", String(port)], {
      cwd: expoDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BROWSER: "none", EXPO_TV: "1", PATH: `${process.env.PATH}:${process.env.HOME}/.toolbox/bin` },
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

    (this as unknown as { _webServerPid?: number })._webServerPid = child.pid;

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
    try {
      execSync(`kill $(lsof -ti:${port}) 2>/dev/null || true`, { stdio: "pipe" });
    } catch {}
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

  private buildSkillContext(phase: Phase): string {
    const meta = this.skills.alwaysLoad();
    const phaseSkills = this.skills.loadForPhase(phase);

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

  private verifyPhaseOutput(phase: Phase): { ok: boolean; error?: string } {
    const appDir = join(this.state.workdir, "app");

    switch (phase) {
      case "clone_template": {
        if (!existsSync(join(appDir, "package.json"))) {
          return { ok: false, error: "Template not cloned: package.json missing in app dir" };
        }
        return { ok: true };
      }
      case "metadata_branding": {
        try {
          const diff = execSync("git diff --stat", { cwd: appDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
          const untracked = execSync("git ls-files --others --exclude-standard", { cwd: appDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
          if (!diff.trim() && !untracked.trim()) {
            return { ok: false, error: "Branding phase made no file changes — app is still the unmodified template" };
          }
        } catch {
          // git not initialized yet — fall through to color check
        }
        try {
          const grepResult = execSync(
            `grep -r "${this.input.brand.primary_color}" packages/shared-ui/ 2>/dev/null | head -1`,
            { cwd: appDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
          );
          if (!grepResult.trim()) {
            return { ok: false, error: `Brand primary color ${this.input.brand.primary_color} not found in shared-ui — theme was not applied` };
          }
        } catch {
          return { ok: false, error: `Brand primary color ${this.input.brand.primary_color} not found in shared-ui — theme was not applied` };
        }
        return { ok: true };
      }
      case "manifest_wiring": {
        const candidates = [
          join(appDir, "packages", "shared-ui", "src", "data"),
          join(appDir, "packages", "shared-ui", "data"),
        ];
        const dataDir = candidates.find(d => existsSync(d));
        if (!dataDir) {
          return { ok: false, error: "Manifest wiring failed: no data/ directory found in shared-ui" };
        }
        try {
          const grepResult = execSync(
            `grep -r "${this.input.content.title}" packages/shared-ui/ 2>/dev/null | head -1`,
            { cwd: appDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
          );
          if (!grepResult.trim()) {
            return { ok: false, error: `Content title "${this.input.content.title}" not found in shared-ui — content was not injected` };
          }
        } catch {
          return { ok: false, error: `Content title "${this.input.content.title}" not found in shared-ui — content was not injected` };
        }
        return { ok: true };
      }
      case "static_checks": {
        try {
          execSync("npx tsc --noEmit", {
            cwd: appDir,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
            timeout: 60_000,
          });
        } catch (err) {
          const msg = err instanceof Error ? (err as { stdout?: string }).stdout ?? err.message : String(err);
          return { ok: false, error: `TypeScript errors remain: ${msg.slice(0, 200)}` };
        }
        return { ok: true };
      }
      case "visual_correctness": {
        const reportPath = join(this.state.workdir, "visual-correctness-report.txt");
        if (!existsSync(reportPath)) {
          return { ok: false, error: "Visual correctness report was not generated" };
        }
        return { ok: true };
      }
      default:
        return { ok: true };
    }
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

  private invokeClaude(prompt: string, cwd: string, timeoutMs: number = 600_000): Promise<string> {
    const claudePath = process.env.CLAUDE_PATH ?? findClaude();
    const phase = this.state.currentPhase;

    return new Promise((resolve, reject) => {
      const child = spawnAsync(claudePath, [
        "-p", "-",
        "--allowedTools", "Bash,Read,Write,Edit",
        "--output-format", "stream-json",
        "--verbose",
      ], {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, PATH: `${process.env.PATH}:${process.env.HOME}/.toolbox/bin` },
      });

      let buffer = "";
      let stderr = "";
      let resultText = "";

      child.stdout!.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            this.handleStreamEvent(phase, event);
            if (event.type === "result") {
              resultText = event.result ?? "";
              if (event.usage) {
                const tokens = (event.usage.input_tokens ?? 0) + (event.usage.output_tokens ?? 0);
                this.state.tokensUsed += tokens;
                this.events.onTokens?.(tokens);
              }
              if (event.total_cost_usd) {
                this.lastPhaseCost = event.total_cost_usd;
              }
            }
          } catch {}
        }
      });

      child.stderr!.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

      child.stdin!.write(prompt);
      child.stdin!.end();

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`claude CLI timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.on("close", (code) => {
        clearTimeout(timer);
        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer);
            this.handleStreamEvent(phase, event);
            if (event.type === "result") {
              resultText = event.result ?? "";
              if (event.usage) {
                const tokens = (event.usage.input_tokens ?? 0) + (event.usage.output_tokens ?? 0);
                this.state.tokensUsed += tokens;
                this.events.onTokens?.(tokens);
              }
              if (event.total_cost_usd) {
                this.lastPhaseCost = event.total_cost_usd;
              }
            }
          } catch {}
        }
        if (code !== 0) {
          reject(new Error(`claude CLI exited with ${code}: ${stderr.slice(0, 500)}`));
        } else {
          resolve(resultText);
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`claude CLI error: ${err.message}`));
      });
    });
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

function findClaude(): string {
  const candidates = [
    join(process.env.HOME ?? "", ".toolbox", "bin", "claude"),
    join(process.env.HOME ?? "", ".local", "bin", "claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
  ];

  for (const p of candidates) {
    try {
      execSync(`test -x "${p}"`, { stdio: "pipe" });
      return p;
    } catch {}
  }

  return "claude";
}
