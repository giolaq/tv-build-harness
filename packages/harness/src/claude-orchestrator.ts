import { execSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AppSpec,
  BrandKit,
  ContentManifest,
  Phase,
  PhaseResult,
  RunConfig,
  SessionState,
} from "./types.js";
import { V1_PHASES, AppSpecSchema } from "./types.js";
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

interface PhaseContext {
  input: HarnessInput;
  spec: AppSpec | null;
  outDir: string;
  appDir: string;
}

const PHASE_INSTRUCTIONS: Record<string, (ctx: PhaseContext) => string> = {
  clone_template: (ctx) => `
Clone the react-native-multi-tv-app-sample template into "${ctx.appDir}":
1. Run: git clone --depth 1 https://github.com/AmazonAppDev/react-native-multi-tv-app-sample.git "${ctx.appDir}"
2. Run: rm -rf "${ctx.appDir}/.git"
3. Run: cd "${ctx.appDir}" && git init
4. Run: cd "${ctx.appDir}" && yarn install
App name: ${ctx.spec?.app_name ?? ctx.input.content.title}
`,

  metadata_branding: (ctx) => `
Apply branding to the cloned template at ${ctx.appDir}:
1. Update ${ctx.appDir}/apps/expo-multi-tv/app.json: set name="${ctx.spec?.app_name}", slug="${ctx.spec?.app_name?.toLowerCase().replace(/\s+/g, "-")}", bundleIdentifier="com.tvharness.${ctx.spec?.app_name?.toLowerCase().replace(/\s+/g, "")}"
2. Replace theme tokens in ${ctx.appDir}/packages/shared-ui/src/theme/ with these colors:
   - primary: ${ctx.input.brand.primary_color}
   - accent: ${ctx.input.brand.accent_color}
   - background: ${ctx.input.brand.background_color}
3. If font_family is specified, update font references to: ${ctx.input.brand.font_family}
`,

  manifest_wiring: (ctx) => `
Wire the content manifest into the template at ${ctx.appDir}:
1. Create directory: ${ctx.appDir}/packages/shared-ui/src/data/
2. Write the content manifest JSON below to ${ctx.appDir}/packages/shared-ui/src/data/content.json
3. Create ${ctx.appDir}/packages/shared-ui/src/data/useContent.ts with hooks: useVideos(), useFeatured(), useCategories(), useVideoById(id), useVideosByCategory(categoryId)
4. Create ${ctx.appDir}/packages/shared-ui/src/data/index.ts that re-exports the hooks

Content manifest:
${JSON.stringify(ctx.input.content, null, 2)}
`,

  simulator_build: (ctx) => `
Build the app for these platforms: ${ctx.input.config.platforms.join(", ")}

Do these steps in order. If any step fails, report the error and continue to the next platform.

1. For web (always attempt first — simplest):
   Run: cd ${ctx.appDir}/apps/expo-multi-tv && EXPO_TV=1 npx expo export --platform web --output-dir ${ctx.outDir}/web-build
   If expo export fails, try: cd ${ctx.appDir}/apps/expo-multi-tv && EXPO_TV=1 npx expo start --web --port 8081 &
   Just verify the command starts without error, then kill the background process.

2. For androidtv (only if ANDROID_HOME is set):
   First check: echo $ANDROID_HOME — if empty, skip with "Android SDK not configured, skipping androidtv"
   Run: cd ${ctx.appDir}/apps/expo-multi-tv && EXPO_TV=1 npx expo prebuild --platform android --no-install

3. For appletv (only if xcodebuild is available):
   First check: which xcodebuild — if not found, skip with "Xcode not available, skipping appletv"
   Run: cd ${ctx.appDir}/apps/expo-multi-tv && EXPO_TV=1 npx expo prebuild --platform ios --no-install

Report a summary: which platforms succeeded, which were skipped, which failed.
At minimum, the web build should succeed (no native dependencies required).
`,

  vega_build: (ctx) => `
Build the Vega OS variant:
Run: cd ${ctx.appDir}/apps/vega && npx kepler build
`,

  visual_smoke_test: (ctx) => `
Verify the build outputs from the previous phase exist and report what was produced.

1. Check if ${ctx.outDir}/web-build/ exists. If yes, list its contents.
2. Check if ${ctx.appDir}/apps/expo-multi-tv/android/ exists (prebuild output). If yes, confirm android prebuild succeeded.
3. Check if ${ctx.appDir}/apps/expo-multi-tv/ios/ exists (prebuild output). If yes, confirm ios prebuild succeeded.

If any simulators/emulators are running:
- Android TV: adb exec-out screencap -p > ${ctx.outDir}/screenshots/androidtv-home.png
- Apple TV: xcrun simctl io booted screenshot ${ctx.outDir}/screenshots/appletv-home.png

If no simulators are running, that is OK. Just verify the build artifacts exist and report the summary.

Write a brief build-report.txt to ${ctx.outDir}/build-report.txt summarizing: platforms attempted, succeeded, skipped, failed.
`,
};

export class ClaudeOrchestrator {
  private state: SessionState;
  private skills: SkillLibrary;
  private log: RunLog;
  private input: HarnessInput;

  constructor(input: HarnessInput) {
    this.skills = new SkillLibrary(input.skillsDir);
    this.input = input;

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

  async run(): Promise<{ state: SessionState; outDir: string }> {
    const phases = this.getActivePhases();

    for (const phase of phases) {
      this.state.currentPhase = phase;
      this.log.phaseStart(phase, this.state.totalIterations);

      console.log(`\n  [${"=".repeat(40)}]`);
      console.log(`  Phase: ${phase}`);
      console.log(`  [${"=".repeat(40)}]\n`);

      const result = await this.executePhase(phase);
      this.state.phaseResults.set(phase, result);

      this.log.phaseEnd(phase, this.state.totalIterations, result.status);

      if (result.status === "failed") {
        console.log(`  Phase ${phase} FAILED: ${result.error}`);
      } else {
        console.log(`  Phase ${phase}: ${result.status}`);
      }
    }

    return { state: this.state, outDir: this.state.workdir };
  }

  private getActivePhases(): Phase[] {
    const { platforms } = this.state.config;

    const generateOnly = process.argv.includes("--generate-only");
    const buildPhases: Phase[] = ["simulator_build", "vega_build", "visual_smoke_test"];

    return V1_PHASES.filter((phase) => {
      if (generateOnly && buildPhases.includes(phase)) return false;
      if (phase === "vega_build") return platforms.includes("firetv-vega");
      return true;
    });
  }

  private async executePhase(phase: Phase): Promise<PhaseResult> {
    this.state.totalIterations++;

    if (phase === "plan") {
      return this.executePlanPhase();
    }

    const instructionBuilder = PHASE_INSTRUCTIONS[phase];
    if (!instructionBuilder) {
      return { phase, status: "degraded", iterations: 1, error: `No instructions for phase: ${phase}` };
    }

    const appDir = join(this.state.workdir, "app");
    const ctx: PhaseContext = {
      input: this.input,
      spec: this.state.spec,
      outDir: this.state.workdir,
      appDir,
    };

    const instructions = instructionBuilder(ctx);
    const skillContext = this.buildSkillContext(phase);

    const fullPrompt = [
      skillContext,
      "",
      "## Your Task",
      instructions,
    ].join("\n");

    try {
      const cwd = phase === "clone_template" ? this.state.workdir : join(this.state.workdir, "app");
      mkdirSync(cwd, { recursive: true });

      const buildPhases: Phase[] = ["simulator_build", "vega_build"];
      const timeoutMs = buildPhases.includes(phase) ? 900_000 : 600_000;

      const output = this.invokeClaude(fullPrompt, cwd, timeoutMs);
      this.log.log({
        phase,
        iteration: this.state.totalIterations,
        event: "model_turn",
        message: output.slice(0, 500),
      });
      return { phase, status: "success", iterations: 1 };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error(phase, this.state.totalIterations, message);
      return { phase, status: "failed", iterations: 1, error: message };
    }
  }

  private executePlanPhase(): PhaseResult {
    const planPrompt = `You are a TV app planner. Given a user brief, content manifest, and brand kit, produce an AppSpec JSON object.

Output ONLY valid JSON (no markdown fencing, no explanation). The JSON must match this schema:
- app_name: string
- theme: { mode: "dark"|"light", tokens: Record<string, string> }
- navigation: { type: "drawer"|"tabs"|"single", routes: [{id, label, icon?}] }
- screens: [{id, route, layout: "hero+rails"|"grid"|"detail"|"player"|"settings"|"search", uses_template_screen?, sections: [{id, kind: "featured_hero"|"rail"|"grid"|"text", data_source, title?}]}]
- components_to_customize: [{component, changes: Record<string,string>}]
- components_to_add: [{name, description, props: Record<string,string>}]
- data_bindings: [{manifest_path, screen_id, section_id}]
- player: { lib: "react-native-video" }
- auth?: { provider: "none"|"oauth", flow?: "device_code" }

Brief: ${this.input.prompt}

Content manifest summary: ${this.input.content.categories.length} categories, ${this.input.content.videos.length} videos, ${this.input.content.featured.length} featured

Brand: name="${this.input.brand.name}", primary=${this.input.brand.primary_color}, accent=${this.input.brand.accent_color}, bg=${this.input.brand.background_color}`;

    try {
      const output = this.invokeClaude(planPrompt, this.state.workdir);

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

  private buildSkillContext(phase: Phase): string {
    const meta = this.skills.alwaysLoad();
    const phaseSkills = this.skills.loadForPhase(phase);

    const parts = [
      "## Context: You are a TV app development agent.",
      "",
      "## App Spec",
      JSON.stringify(this.state.spec, null, 2),
      "",
      "## Skills (domain knowledge for this phase)",
      meta,
      ...phaseSkills,
    ];

    return parts.join("\n");
  }

  private invokeClaude(prompt: string, cwd: string, timeoutMs: number = 600_000): string {
    const claudePath = process.env.CLAUDE_PATH ?? findClaude();

    const result = spawnSync(claudePath, [
      "-p", prompt,
      "--allowedTools", "Bash,Read,Write,Edit",
    ], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      encoding: "utf-8",
      env: { ...process.env, PATH: `${process.env.PATH}:${process.env.HOME}/.toolbox/bin` },
    });

    if (result.error) {
      throw new Error(`claude CLI error: ${result.error.message}`);
    }

    if (result.status !== 0) {
      const stderr = result.stderr?.toString() ?? "";
      throw new Error(`claude CLI exited with ${result.status}: ${stderr.slice(0, 500)}`);
    }

    return result.stdout?.toString() ?? "";
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
