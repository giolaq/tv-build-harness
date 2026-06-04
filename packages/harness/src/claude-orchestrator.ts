import { execSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
import { generateScreenshotReport } from "./screenshot-report.js";

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
3. Run: cd "${ctx.appDir}" && git init && git add -A && git commit -m "initial template"
4. Run: cd "${ctx.appDir}" && yarn install
App name: ${ctx.spec?.app_name ?? ctx.input.content.title}
`,

  metadata_branding: (ctx) => {
    const appName = ctx.spec?.app_name ?? ctx.input.content.title;
    const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const bundleId = "com.tvharness." + appName.toLowerCase().replace(/[^a-z0-9]/g, "");
    return `
You MUST customize the app's identity and visual theme. The app currently looks like the generic template — your job is to make it look like "${appName}".

STEP 1: Read the existing files to understand their current structure.
Run these reads first:
- Read ${ctx.appDir}/apps/expo-multi-tv/app.json
- Find the theme tokens file: look in ${ctx.appDir}/packages/shared-ui/ for files containing color definitions (likely in theme/, src/theme/, or similar — use find to locate files with "background" or "primary" color values)

STEP 2: Update app metadata.
Edit ${ctx.appDir}/apps/expo-multi-tv/app.json:
- Set "name" to "${appName}"
- Set "slug" to "${slug}"
- Set the iOS bundleIdentifier to "${bundleId}"
- Set the Android package to "${bundleId}"
- Set the display name / app name wherever it appears

STEP 3: Replace ALL color values in the theme tokens file.
Find the theme tokens file (search for it — it may be tokens.ts, theme.ts, colors.ts, or similar inside packages/shared-ui/).
Replace the color values with these EXACT values:
- primary/brand color → ${ctx.input.brand.primary_color}
- accent/highlight color → ${ctx.input.brand.accent_color}
- background color → ${ctx.input.brand.background_color}
- surface color → derive from background (slightly lighter): adjust background +10% lightness
- text color → #FFFFFF (dark theme)
- muted text → #A0A0A8

Do NOT just create new files. You MUST edit the existing theme files in-place so all existing components pick up the new colors automatically.

STEP 4: Update font if specified.
Font family to use: ${ctx.input.brand.font_family || "System (no change needed)"}

STEP 5: Verify your changes.
Run: cd "${ctx.appDir}" && grep -r "${ctx.input.brand.primary_color}" packages/shared-ui/ | head -5
This should show your color appearing in the theme files. If it shows nothing, your edits didn't work — try again.
`;
  },

  manifest_wiring: (ctx) => `
You MUST wire the content manifest into the existing screens so the app displays THIS content, not the template's default content.

STEP 1: Discover how the template currently loads data.
Run these commands:
- find ${ctx.appDir}/packages/shared-ui -name "*.ts" -o -name "*.tsx" | grep -i -E "(data|content|hook|seed|mock)" | head -20
- grep -r "import.*data" ${ctx.appDir}/packages/shared-ui/src/ --include="*.ts" --include="*.tsx" -l | head -10
- Find where the Home screen gets its video/content data from

STEP 2: Write the content manifest.
Find the existing data directory (might be data/, src/data/, or similar in shared-ui).
If there's an existing content/data/seed JSON file, OVERWRITE it with the manifest below.
If there's no existing data file, create it where the existing imports expect it.

The content manifest to inject:
${JSON.stringify(ctx.input.content, null, 2)}

STEP 3: Update or create data hooks.
Find the existing hooks that screens use to get content (look for useFeatured, useVideos, useCategories, or similar).
If they exist, modify them to read from your new content file.
If they don't exist, create them AND update the screens to import from them.

Required hooks:
- useFeatured() → returns videos where id is in: ${JSON.stringify(ctx.input.content.featured)}
- useCategories() → returns: ${JSON.stringify(ctx.input.content.categories.map(c => c.name))}
- useVideos() → returns all ${ctx.input.content.videos.length} videos
- useVideoById(id) → returns single video by id

STEP 4: Wire screens to use YOUR data.
This is the critical step. Find each screen component (Home, Detail, etc.) and ensure it renders YOUR content.
- grep -r "featured\\|hero\\|banner" ${ctx.appDir}/packages/shared-ui/src/screens/ --include="*.tsx" -l
- Read each screen file. If it imports from a hardcoded source, update the import.
- If screens use sample/placeholder data, replace those references with your hooks.

STEP 5: Update the app title in the drawer/navigation.
Find where the drawer header or app title is set and change it to "${ctx.input.content.title}".
grep -r "drawerLabel\\|headerTitle\\|title" ${ctx.appDir}/packages/shared-ui/ --include="*.tsx" --include="*.ts" | head -10

STEP 6: Verify the wiring works.
Run: cd "${ctx.appDir}" && npx tsc --noEmit 2>&1 | head -30
If there are TypeScript errors, fix them. The app must typecheck.
`,

  screen_customization: (ctx) => {
    const spec = ctx.spec;
    if (!spec) return "No AppSpec available. Skip this phase.";

    const screensList = spec.screens.map(s =>
      `- ${s.id}: layout="${s.layout}", route="${s.route}"${s.uses_template_screen ? `, reuses="${s.uses_template_screen}"` : ""}`
    ).join("\n");

    return `
Customize screens to match the AppSpec. The principle is REUSE FIRST — only create new screens if the template doesn't have one that fits.

STEP 1: Discover what screens already exist in the template.
Run: find ${ctx.appDir}/packages/shared-ui/src/screens -name "*.tsx" | head -20
Read the screen files to understand their layouts.

STEP 2: Match AppSpec screens to template screens.
AppSpec screens:
${screensList}

For each AppSpec screen:
- If "uses_template_screen" is set, verify that screen exists and only make minor customizations (props, data source).
- If the layout matches an existing template screen (hero+rails → HomeScreen, grid → GridScreen, detail → DetailScreen, player → PlayerScreen), reuse it.
- Only create a NEW screen file if no existing screen can serve the purpose.

STEP 3: Create any genuinely new screens.
For new screens, create them at ${ctx.appDir}/packages/shared-ui/src/screens/<ScreenName>Screen.tsx.
Use existing components from ${ctx.appDir}/packages/shared-ui/src/components/ — read what's available first.
Ensure all interactive elements use Pressable with focus handlers for D-pad navigation.

STEP 4: Export all screens from the screens index.
Check ${ctx.appDir}/packages/shared-ui/src/screens/index.ts (or similar barrel file) and add exports for any new screens.

STEP 5: Verify.
Run: cd "${ctx.appDir}" && npx tsc --noEmit 2>&1 | head -20
Fix any TypeScript errors.
`;
  },

  navigation_update: (ctx) => {
    const spec = ctx.spec;
    if (!spec) return "No AppSpec available. Skip this phase.";

    const routesList = spec.navigation.routes.map(r =>
      `- id="${r.id}", label="${r.label}"${r.icon ? `, icon="${r.icon}"` : ""}`
    ).join("\n");

    return `
Update the app navigation to match the AppSpec.

Navigation type: ${spec.navigation.type}
Routes:
${routesList}

STEP 1: Find the navigation configuration.
Run: find ${ctx.appDir}/packages/shared-ui/src -name "*.tsx" -o -name "*.ts" | grep -i -E "(nav|drawer|route|stack)" | head -10
Read the navigation files.

STEP 2: Update the route table.
The navigation must have exactly these routes in this order. Add missing routes, remove routes not in the list, and reorder to match.

Each route should point to the corresponding screen component. Match route IDs to screen IDs from the AppSpec.

STEP 3: Update drawer labels and icons.
Set the display labels and icons to match the AppSpec route definitions.

STEP 4: Verify navigation renders.
Run: cd "${ctx.appDir}" && npx tsc --noEmit 2>&1 | head -20
Fix any TypeScript errors (missing screen imports, incorrect types, etc).
`;
  },

  static_checks: (ctx) => `
Run all static checks and fix any errors.

STEP 1: TypeScript check.
Run: cd "${ctx.appDir}" && npx tsc --noEmit 2>&1
If there are errors, fix them. Common issues:
- Missing imports for new screens or hooks
- Type mismatches in data hooks (content shape changed)
- Unused imports from removed template code

STEP 2: Lint (if available).
Run: cd "${ctx.appDir}" && npx eslint src/ --ext .ts,.tsx 2>&1 | tail -20
Fix auto-fixable issues: cd "${ctx.appDir}" && npx eslint src/ --ext .ts,.tsx --fix

STEP 3: Verify all screens are reachable.
Check that every screen exported from screens/index.ts is referenced in the navigation config.
grep -r "Screen" ${ctx.appDir}/packages/shared-ui/src/navigation/ --include="*.tsx" --include="*.ts"

Report: how many errors found, how many fixed, any remaining.
`,

  simulator_build: (ctx) => `
Build the app for these platforms: ${ctx.input.config.platforms.join(", ")}

Do these steps in order. If any step fails, report the error and continue to the next platform.

1. First verify the project is healthy:
   Run: cd ${ctx.appDir} && yarn install && cd apps/expo-multi-tv && npx tsc --noEmit 2>&1 | tail -10
   If there are type errors, fix them before proceeding.

2. For web (always attempt first — simplest):
   Run: cd ${ctx.appDir}/apps/expo-multi-tv && EXPO_TV=1 npx expo export --platform web --output-dir ${ctx.outDir}/web-build
   If expo export fails, try: cd ${ctx.appDir}/apps/expo-multi-tv && EXPO_TV=1 npx expo start --web --port 8081 &
   Just verify the command starts without error, then kill the background process.

3. For androidtv (only if ANDROID_HOME is set):
   First check: echo $ANDROID_HOME — if empty, skip with "Android SDK not configured, skipping androidtv"
   Run: cd ${ctx.appDir}/apps/expo-multi-tv && EXPO_TV=1 npx expo prebuild --platform android --no-install

4. For appletv (only if xcodebuild is available):
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

      let result = await this.executePhaseWithRetry(phase);

      this.state.phaseResults.set(phase, result);
      this.log.phaseEnd(phase, this.state.totalIterations, result.status);

      if (result.status === "failed") {
        console.log(`  Phase ${phase} FAILED: ${result.error}`);
        if (phase === "plan") {
          console.log(`  Aborting: cannot continue without a valid AppSpec.`);
          break;
        }
      } else if (result.status === "degraded") {
        console.log(`  Phase ${phase} DEGRADED: ${result.error}`);
      } else {
        console.log(`  Phase ${phase}: ${result.status}`);
        this.commitAfterPhase(phase);
      }
    }

    this.writeReport();
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

  private async executePhaseWithRetry(phase: Phase): Promise<PhaseResult> {
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

  private invokeClaude(prompt: string, cwd: string, timeoutMs: number = 600_000): string {
    const claudePath = process.env.CLAUDE_PATH ?? findClaude();

    const result = spawnSync(claudePath, [
      "-p", "-",
      "--allowedTools", "Bash,Read,Write,Edit",
    ], {
      cwd,
      input: prompt,
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
