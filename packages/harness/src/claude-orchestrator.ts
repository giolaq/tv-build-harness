import { execSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
import { V1_PHASES, AppSpecSchema } from "./types.js";
import { SkillLibrary } from "./skill-library.js";
import { RunLog } from "./run-log.js";
import { generateScreenshotReport } from "./screenshot-report.js";

interface HarnessInput {
  prompt: string;
  content: ContentManifest;
  brand: BrandKit;
  config: RunConfig;
  design: DesignTokens;
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
    const navType = spec.navigation.type;
    const navStyle = ctx.input.design.navigation_style;

    const routesList = spec.navigation.routes.map(r =>
      `- id="${r.id}", label="${r.label}"${r.icon ? `, icon="${r.icon}"` : ""}`
    ).join("\n");

    const typeInstructions: Record<string, string> = {
      drawer: `
The template already uses a drawer navigator. Keep it. Update the drawer items to match these routes.
Edit the DrawerNavigator file to:
- Map each route to its screen component
- Set the correct labels and icons
- Remove any routes not in the list above`,

      tabs: `
The template uses a drawer navigator — you MUST REPLACE it with a top tab navigator.

Steps to switch from drawer to tabs:
1. Check if @react-navigation/bottom-tabs or @react-navigation/material-top-tabs is installed.
   If not: run "yarn workspace @multi-tv/shared-ui add @react-navigation/bottom-tabs" (or add to the expo-multi-tv workspace if that's where nav deps live)
2. Find the DrawerNavigator file (likely DrawerNavigator.tsx or similar in packages/shared-ui/src/navigation/)
3. REPLACE the entire drawer navigator with a tab navigator. Use createBottomTabNavigator() or createMaterialTopTabNavigator() for a top bar.
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

    const resolvedType = navStyle === "hidden" ? "hidden" : navType;
    const instructions = typeInstructions[resolvedType] ?? typeInstructions["drawer"];

    return `
Update the app navigation to match the AppSpec.

Navigation type requested: ${resolvedType}
Routes:
${routesList}

STEP 1: Find the current navigation files.
Run: find ${ctx.appDir}/packages/shared-ui/src -name "*.tsx" -o -name "*.ts" | grep -i -E "(nav|drawer|route|stack|tab)" | head -15
Read the main navigator files to understand the current structure.

STEP 2: Apply the navigation type.
${instructions}

STEP 3: Wire the routes.
Each route must point to an EXISTING screen component. First check what screens exist:
Run: ls ${ctx.appDir}/packages/shared-ui/src/screens/
Only import screens that exist in that directory. Do NOT import non-existent screens.

Route → Screen mapping (use the closest match):
${routesList}

STEP 4: Verify.
Run: cd "${ctx.appDir}" && npx tsc --noEmit 2>&1 | head -20
Fix any TypeScript errors. Common issues after nav switch:
- Missing @react-navigation/bottom-tabs or material-top-tabs package
- Old drawer imports left behind
- Screen component names don't match file names
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

  simulator_build: (ctx) => {
    const platforms = ctx.input.config.platforms;
    const wantsWeb = platforms.includes("web") || platforms.includes("appletv") || platforms.includes("androidtv");
    const wantsAndroid = platforms.includes("androidtv") || platforms.includes("firetv-fos");
    const wantsIos = platforms.includes("appletv");

    return `
Build the app. Focus on web first (fastest feedback loop), then native if requested.

Platforms requested: ${platforms.join(", ")}

STEP 1: Verify the project compiles.
Run: cd ${ctx.appDir}/apps/expo-multi-tv && npx tsc --noEmit 2>&1 | tail -10
If there are type errors, fix them before proceeding.

STEP 2: Web build (always do this — fastest verification).
Run: cd ${ctx.appDir}/apps/expo-multi-tv && EXPO_TV=1 npx expo start --web --port 19006 &
Wait: sleep 5
Verify: curl -s http://localhost:19006 | head -5
If HTML is returned, web build works. Kill it: kill $(lsof -ti:19006) 2>/dev/null || true
${wantsAndroid ? `
STEP 3: Android TV prebuild.
First check: echo $ANDROID_HOME — if empty, skip with "Android SDK not configured"
Run: cd ${ctx.appDir}/apps/expo-multi-tv && EXPO_TV=1 npx expo prebuild --platform android --no-install
` : ""}${wantsIos ? `
STEP ${wantsAndroid ? "4" : "3"}: Apple TV prebuild.
First check: which xcodebuild — if not found, skip with "Xcode not available"
Run: cd ${ctx.appDir}/apps/expo-multi-tv && EXPO_TV=1 npx expo prebuild --platform ios --no-install
` : ""}
Report: which platforms succeeded, which were skipped, which failed.
`;
  },

  vega_build: (ctx) => `
Build the Vega OS variant:
Run: cd ${ctx.appDir}/apps/vega && npx kepler build
`,

  visual_smoke_test: (ctx) => {
    const screenshotDir = `${ctx.outDir}/screenshots`;
    const routes = ctx.spec?.navigation.routes ?? [];
    const routeNames = routes.map(r => r.id).join(", ");

    return `
Test the web version of the app: start it, screenshot every screen, test navigation and focus.

STEP 1: Start the Expo web dev server.
Run: cd ${ctx.appDir}/apps/expo-multi-tv && EXPO_TV=1 npx expo start --web --port 19006 &
Run: sleep 8

Verify: curl -s http://localhost:19006 | head -5
If it fails, check the process output for errors and try to fix them.

STEP 2: Screenshot every screen.
Write and run this puppeteer script (save as ${ctx.outDir}/test-runner.js then run it):

const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--window-size=1920,1080']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Helper: screenshot with name
  async function screenshot(name) {
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: '${screenshotDir}/' + name + '.png' });
    console.log('Screenshot: ' + name);
  }

  // Helper: press key
  async function pressKey(key, times = 1) {
    for (let i = 0; i < times; i++) {
      await page.keyboard.press(key);
      await new Promise(r => setTimeout(r, 500));
    }
  }

  try {
    // 1. Home screen
    await page.goto('http://localhost:19006', { waitUntil: 'networkidle0', timeout: 30000 });
    await screenshot('web-01-home');

    // 2. Test focus navigation with arrow keys (D-pad simulation)
    await pressKey('ArrowRight', 3);
    await screenshot('web-02-home-focus-moved');

    await pressKey('ArrowDown', 2);
    await screenshot('web-03-home-scrolled');

    // 3. Navigate to other screens via keyboard
    // Try opening drawer/menu with ArrowLeft or Tab
    await pressKey('ArrowLeft', 5);
    await screenshot('web-04-navigation-open');

    // Move down through nav items and select
    await pressKey('ArrowDown', 1);
    await pressKey('Enter');
    await screenshot('web-05-second-screen');

    await pressKey('ArrowDown', 1);
    await pressKey('Enter');
    await screenshot('web-06-third-screen');

    // 4. Go back to home, select a content item
    await pressKey('ArrowLeft', 5);
    await pressKey('ArrowUp', 3);
    await pressKey('Enter');
    await new Promise(r => setTimeout(r, 1000));
    await screenshot('web-07-home-returned');

    // Select first content tile
    await pressKey('ArrowRight', 1);
    await pressKey('ArrowDown', 1);
    await pressKey('Enter');
    await screenshot('web-08-detail-screen');

    // 5. Check for errors in console
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    console.log('\\nTest Results:');
    console.log('Screenshots captured: 8');
    console.log('Console errors: ' + consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.log('Errors:');
      consoleErrors.slice(0, 5).forEach(e => console.log('  - ' + e));
    }
  } catch(e) {
    console.log('Test error: ' + e.message);
    await screenshot('web-error-state');
  }

  await browser.close();
})();

If puppeteer is not available, do a simpler test:
- curl http://localhost:19006 and verify HTML contains the app name "${ctx.spec?.app_name ?? "App"}"
- curl different hash routes if the app uses hash routing (#/categories, #/settings)

STEP 3: Verify focus management.
Check the source code for these focus issues:
- grep -r "Pressable" ${ctx.appDir}/packages/shared-ui/src/screens/ --include="*.tsx" | wc -l → should be > 0
- grep -r "onFocus\\|focused" ${ctx.appDir}/packages/shared-ui/src/screens/ --include="*.tsx" | wc -l → should be > 0
- grep -r "TVFocusGuide\\|SpatialNavigation\\|react-tv-space-navigation" ${ctx.appDir}/packages/shared-ui/src/ --include="*.tsx" | wc -l → should be > 0

STEP 4: Verify all routes are wired.
Expected routes: ${routeNames}
Check that each screen component is imported in the navigation:
grep -r "Screen" ${ctx.appDir}/packages/shared-ui/src/navigation/ --include="*.tsx" --include="*.ts"

STEP 5: Kill the dev server.
Run: kill $(lsof -ti:19006) 2>/dev/null || true

STEP 6: Write the test report.
Write ${ctx.outDir}/build-report.txt with:
- Web server: started / failed
- Screenshots captured: count
- Focus navigation: D-pad works / partial / no focus handlers found
- Routes wired: all / missing (list which)
- Console errors: count
- Overall: PASS / PARTIAL / FAIL
`;
  },
};

export interface HarnessEvents {
  onPhaseStart?: (phase: Phase) => void;
  onPhaseEnd?: (phase: Phase, result: PhaseResult) => void;
  onLog?: (message: string) => void;
}

export class ClaudeOrchestrator {
  private state: SessionState;
  private skills: SkillLibrary;
  private log: RunLog;
  private input: HarnessInput;
  private events: HarnessEvents;

  constructor(input: HarnessInput, events: HarnessEvents = {}) {
    this.skills = new SkillLibrary(input.skillsDir);
    this.input = input;
    this.events = events;

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
      this.events.onPhaseStart?.(phase);

      if (!this.events.onLog) {
        console.log(`\n  [${"=".repeat(40)}]`);
        console.log(`  Phase: ${phase}`);
        console.log(`  [${"=".repeat(40)}]\n`);
      }

      let result = await this.executePhaseWithRetry(phase);

      this.state.phaseResults.set(phase, result);
      this.log.phaseEnd(phase, this.state.totalIterations, result.status);
      this.events.onPhaseEnd?.(phase, result);

      if (result.status === "failed") {
        if (!this.events.onLog) console.log(`  Phase ${phase} FAILED: ${result.error}`);
        this.events.onLog?.(`Phase ${phase} FAILED: ${result.error}`);
        if (phase === "plan") {
          if (!this.events.onLog) console.log(`  Aborting: cannot continue without a valid AppSpec.`);
          break;
        }
      } else if (result.status === "degraded") {
        if (!this.events.onLog) console.log(`  Phase ${phase} DEGRADED: ${result.error}`);
        this.events.onLog?.(`Phase ${phase} DEGRADED: ${result.error}`);
      } else {
        if (!this.events.onLog) console.log(`  Phase ${phase}: ${result.status}`);
        this.events.onLog?.(`Phase ${phase}: ${result.status}`);
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

    // Log prompt for debugging
    writeFileSync(
      join(this.state.workdir, `prompt-${phase}.md`),
      `# Phase: ${phase}\n\n## Full Prompt (${fullPrompt.length} chars)\n\n${fullPrompt}\n`
    );

    try {
      const cwd = phase === "clone_template" ? this.state.workdir : join(this.state.workdir, "app");
      mkdirSync(cwd, { recursive: true });

      const buildPhases: Phase[] = ["simulator_build", "vega_build"];
      const timeoutMs = buildPhases.includes(phase) ? 900_000 : 600_000;

      const output = this.invokeClaude(fullPrompt, cwd, timeoutMs);

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

    // Log plan prompt
    writeFileSync(
      join(this.state.workdir, "prompt-plan.md"),
      `# Phase: plan\n\n## Prompt (${planPrompt.length} chars)\n\n${planPrompt}\n`
    );

    try {
      const output = this.invokeClaude(planPrompt, this.state.workdir);

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
