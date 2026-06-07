import { execSync, spawn as spawnAsync, spawnSync } from "node:child_process";
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
import { V1_PHASES, PHASE_DEPS, AppSpecSchema } from "./types.js";
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
3. CRITICAL: Fix React duplicate resolution. The template has multiple workspaces that can each resolve their own React copy, causing "Cannot read properties of undefined (reading 'ReactCurrentOwner')" at runtime.
   Read ${ctx.appDir}/package.json, then edit it to add resolutions that force a single React copy:
   Add these to the "resolutions" field (merge with existing):
     "react": "18.3.1",
     "react-dom": "18.3.1",
     "@types/react": "^18.2.0"
   Also read ${ctx.appDir}/apps/expo-multi-tv/package.json and ensure its react/react-dom versions match "18.3.1".
   Also read ${ctx.appDir}/packages/shared-ui/package.json — if react-tv-space-navigation uses a wildcard ("*") or beta version, pin it to the latest stable: "^5.2.0"
4. Run: cd "${ctx.appDir}" && yarn install
5. Run: cd "${ctx.appDir}" && git init && git add -A && git commit -m "initial template"
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
All interactive elements must use the template's existing Pressable or Tile components (which already wrap SpatialNavigationFocusableView internally).

⚠️ DO NOT add custom onFocus, onKeyDown, or keyboard event listeners for D-pad navigation.
The react-tv-space-navigation library handles ALL arrow key → focus movement automatically.
Adding custom handlers causes DOUBLE-STEP focus (each keypress moves 2 positions instead of 1).

Only add:
- onPress / onSelect → for selection actions (the library calls these on Enter/Select)
- onLongPress → for long-press actions
- Visual styling via the isFocused render prop (already built into template's Tile/Card)

DO NOT add: onKeyDown, addEventListener('keydown'), manual focus management with useEffect, or any code that calls setFocus/moveFocus in response to arrow keys.

⚠️ OVERFLOW RULE for any element with a focused scale transform:
If a card/tile has overflow:'hidden' (for image border-radius clipping), the focused style MUST add overflow:'visible' so the focus border and scale growth are not clipped by the element's own bounds. The parent container must also have overflow:'visible' and enough padding to accommodate the scale growth. Example:
  thumbnail: { overflow: 'hidden', borderRadius: 12 },
  thumbnailFocused: { overflow: 'visible', transform: [{ scale: 1.1 }], borderWidth: 6 }

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
- Remove any routes not in the list above
- KEEP any existing focus trapping logic (SpatialNavigationNode with captureFocus) in the drawer content`,

      tabs: `
The template uses a drawer navigator — you MUST REPLACE it with a top tab navigator.

Steps to switch from drawer to tabs:
1. Check if @react-navigation/bottom-tabs or @react-navigation/material-top-tabs is installed.
   If not: run "yarn workspace @multi-tv/shared-ui add @react-navigation/bottom-tabs" (or add to the expo-multi-tv workspace if that's where nav deps live)
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

    const resolvedType = navStyle === "hidden" ? "hidden" : navType;
    const instructions = typeInstructions[resolvedType] ?? typeInstructions["drawer"];

    return `
Update the app navigation to match the AppSpec.

Navigation type requested: ${resolvedType}
Routes:
${routesList}

⚠️ CRITICAL: SPATIAL NAVIGATION MUST BE PRESERVED ⚠️

This template uses "react-tv-space-navigation" for D-pad/remote control focus management.
It does NOT use browser tabIndex or native TVFocusGuide — it has its own virtual focus tree.
If you break the spatial navigation setup, the app will render but the remote/keyboard will NOT work.

Rules you MUST follow:
1. DO NOT remove or interfere with <SpatialNavigationRoot> in any screen component
2. DO NOT remove the spatial navigation provider/configuration from the app root (check App.tsx or the root navigator for SpatialNavigationDeviceTypeProvider or similar setup)
3. DO NOT use tabIndex for focusable elements — use the template's existing Tile/Pressable components which wrap SpatialNavigationFocusableView
4. DO NOT nest multiple <SpatialNavigationRoot> — exactly one per screen
5. The navigation container itself must remain keyboard-accessible — tab bars/drawers need their items to be SpatialNavigationFocusableView nodes so the remote can reach them
6. KEEP the remote-control/ directory and its platform handlers UNTOUCHED

STEP 1: Understand the current spatial navigation setup.
Run: grep -rn "SpatialNavigation\\|react-tv-space-navigation\\|SpatialNavigationRoot\\|SpatialNavigationNode" ${ctx.appDir}/packages/shared-ui/src/ --include="*.tsx" --include="*.ts" | head -20
Run: grep -rn "SpatialNavigation" ${ctx.appDir}/apps/expo-multi-tv/App.tsx 2>/dev/null || grep -rn "SpatialNavigation" ${ctx.appDir}/apps/expo-multi-tv/src/ --include="*.tsx" 2>/dev/null | head -10
Run: cat ${ctx.appDir}/packages/shared-ui/src/remote-control/ 2>/dev/null && ls ${ctx.appDir}/packages/shared-ui/src/remote-control/ 2>/dev/null

Note what you find. You must preserve ALL of this.

STEP 2: Find the current navigation files.
Run: find ${ctx.appDir}/packages/shared-ui/src -name "*.tsx" -o -name "*.ts" | grep -i -E "(nav|drawer|route|stack|tab)" | head -15
Read the main navigator files to understand the current structure.

STEP 3: Apply the navigation type.
${instructions}

STEP 4: Make the new navigation focusable with spatial navigation.
After changing the navigator type, you MUST ensure the navigation UI itself works with the remote:

For TABS:
- Each tab item must be focusable. Wrap the tab bar in a SpatialNavigationNode with orientation="horizontal".
- Use a custom tabBar component that renders each tab as a SpatialNavigationFocusableView.
- When a tab is focused, highlight it visually. When pressed (Enter/Select), switch to that tab.
- Example pattern:
  tabBar: (props) => (
    <SpatialNavigationNode orientation="horizontal">
      {props.state.routes.map((route, i) => (
        <SpatialNavigationFocusableView key={route.key} onSelect={() => props.navigation.navigate(route.name)}>
          {({isFocused}) => (
            <Text style={[styles.tab, isFocused && styles.tabFocused]}>{route.name}</Text>
          )}
        </SpatialNavigationFocusableView>
      ))}
    </SpatialNavigationNode>
  )

⚠️ DO NOT add onKeyDown, addEventListener('keydown'), or any manual arrow-key handling anywhere.
The spatial-navigation library is the SOLE owner of D-pad/arrow-key events.
If you add a parallel listener, every keypress will move focus TWICE (double-step bug).
The SpatialNavigationFocusableView's onSelect prop is the ONLY handler you need — it fires on Enter/Select.

For DRAWER:
- The drawer content items must be SpatialNavigationFocusableView nodes.
- The drawer itself should be wrapped in SpatialNavigationNode with captureFocus when open.

For HIDDEN:
- No navigation UI to worry about. Just ensure each screen still has its SpatialNavigationRoot.

STEP 5: Wire the routes.
Each route must point to an EXISTING screen component. First check what screens exist:
Run: ls ${ctx.appDir}/packages/shared-ui/src/screens/
Only import screens that exist in that directory. Do NOT import non-existent screens.

Route → Screen mapping (use the closest match):
${routesList}

STEP 6: Verify navigation + focus integration.
Run: cd "${ctx.appDir}" && npx tsc --noEmit 2>&1 | head -20
Fix any TypeScript errors.

Then verify spatial navigation is intact:
Run: grep -rn "SpatialNavigationRoot" ${ctx.appDir}/packages/shared-ui/src/screens/ --include="*.tsx" | wc -l
This count must be ≥ the number of screens. If any screen is missing its SpatialNavigationRoot, add it.

Run: grep -rn "SpatialNavigationFocusableView\\|SpatialNavigationNode" ${ctx.appDir}/packages/shared-ui/src/navigation/ --include="*.tsx"
If the navigation UI has zero spatial navigation nodes, the remote CANNOT reach it. Fix this.

STEP 7: Verify keyboard/back navigation.
Check that React Navigation's back handling is still wired:
Run: grep -rn "BackHandler\\|goBack\\|headerBackVisible\\|backBehavior" ${ctx.appDir}/packages/shared-ui/src/ --include="*.tsx" --include="*.ts" | head -10
For web, React Navigation handles Backspace by default if the navigation container is properly set up. Ensure you haven't removed the NavigationContainer wrapper.
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

STEP 4: Check for duplicate remote control registration (CAUSES DOUBLE-STEP FOCUS BUG).
Run: grep -rn "configureRemoteControl\\|import.*configureRemoteControl" ${ctx.appDir}/ --include="*.tsx" --include="*.ts" | grep -v node_modules

The file "configureRemoteControl" calls SpatialNavigation.configureRemoteControl() which registers a keyboard event listener. If this file is imported MORE THAN ONCE (from different locations), the listener is registered multiple times and every keypress fires 2+ events → double-step focus.

There must be EXACTLY ONE import of configureRemoteControl in the entire app. It should be in the root App.tsx (the entry point) ONLY.

If you find multiple imports:
- Keep ONLY the one in apps/expo-multi-tv/App.tsx (the root entry)
- REMOVE any require() or import of configureRemoteControl from:
  - navigation/AppNavigator.tsx
  - apps/expo-multi-tv/app/configureRemoteControl.ts (delete this file if it just re-exports)
  - Any other location

After removing duplicates, verify:
Run: grep -rn "configureRemoteControl\\|import.*configureRemoteControl" ${ctx.appDir}/ --include="*.tsx" --include="*.ts" | grep -v node_modules | wc -l
This must return exactly 2 (the definition file + one import in App.tsx).

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
Run: cd ${ctx.appDir}/apps/expo-multi-tv && BROWSER=none EXPO_TV=1 npx expo start --web --port 19006 &
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

  visual_correctness: (ctx) => {
    const brand = ctx.input.brand;
    const design = ctx.input.design;
    const screenshotDir = `${ctx.outDir}/screenshots`;
    const routes = ctx.spec?.navigation.routes ?? [];
    const routeCount = routes.length;

    return `
You are a visual QA engineer for TV applications. Your job is to render the app, screenshot every screen and state, then analyze the screenshots pixel-by-pixel for layout defects.

TV apps are viewed from 10 feet away on large screens (1920x1080). Visual defects that might be acceptable on mobile are UNACCEPTABLE here — every pixel matters at that scale.

## STEP 1: Start the app

Run: cd ${ctx.appDir}/apps/expo-multi-tv && BROWSER=none EXPO_TV=1 npx expo start --web --port 19007 &
Run: sleep 10
Verify: curl -s http://localhost:19007 | head -5

If it fails, check for port conflicts and try again. The app MUST be running before you continue.

## STEP 2: Capture comprehensive screenshots

Write and run this puppeteer script (save as ${ctx.outDir}/visual-check.cjs then run with node):

const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1920,1080', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  const ssDir = '${screenshotDir}';
  let shotIndex = 0;

  async function screenshot(name) {
    await new Promise(r => setTimeout(r, 1500));
    const file = path.join(ssDir, \`vc-\${String(++shotIndex).padStart(2,'0')}-\${name}.png\`);
    await page.screenshot({ path: file, fullPage: false });
    console.log('Captured: ' + name);
    return file;
  }

  async function pressKey(key, times = 1) {
    for (let i = 0; i < times; i++) {
      await page.keyboard.press(key);
      await new Promise(r => setTimeout(r, 400));
    }
  }

  // Focus a specific Pressable/card element by index within the viewport
  async function focusNth(selector, n) {
    await page.evaluate((sel, idx) => {
      const els = document.querySelectorAll(sel);
      if (els[idx]) {
        els[idx].focus();
        els[idx].dispatchEvent(new FocusEvent('focus', { bubbles: true }));
        // Also dispatch keyboard event so spatial nav libraries react
        els[idx].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        els[idx].dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
      }
    }, selector, n);
    await new Promise(r => setTimeout(r, 600));
  }

  // Get all focusable elements to understand the app's focus tree
  async function getFocusableCount() {
    return page.evaluate(() => {
      const focusable = document.querySelectorAll('[tabindex], [data-focusable="true"], [role="button"], a, button');
      return focusable.length;
    });
  }

  try {
    // Home screen — default state
    await page.goto('http://localhost:19007', { waitUntil: 'networkidle0', timeout: 30000 });
    await screenshot('home-default');

    // IMPORTANT: Click the page body to give the webview focus, otherwise key events are ignored
    await page.click('body');
    await new Promise(r => setTimeout(r, 300));

    // Detect the app's focusable elements
    const focusableCount = await getFocusableCount();
    console.log('Focusable elements found: ' + focusableCount);

    // Determine the card/tile selector used by the app
    const cardSelector = await page.evaluate(() => {
      // Try common selectors used by RN Web and spatial-nav libraries
      const candidates = [
        '[data-focusable="true"]',
        '[role="button"]',
        '[tabindex="0"]',
        '.focusable',
        '[data-testid*="card"]',
        '[data-testid*="tile"]',
      ];
      for (const sel of candidates) {
        if (document.querySelectorAll(sel).length > 2) return sel;
      }
      // Fallback: any element with tabindex
      return '[tabindex]';
    });
    console.log('Card selector: ' + cardSelector);

    // === FOCUS TESTING: Use BOTH keyboard nav AND direct element focus ===

    // Method 1: Keyboard navigation (Tab / Arrow keys)
    // Tab first to enter the focusable tree
    await page.keyboard.press('Tab');
    await new Promise(r => setTimeout(r, 500));
    await screenshot('home-tab-first-focus');

    await pressKey('ArrowRight', 1);
    await screenshot('home-arrow-right-1');

    await pressKey('ArrowRight', 1);
    await screenshot('home-arrow-right-2');

    await pressKey('ArrowDown', 1);
    await screenshot('home-arrow-down-1');

    // Method 2: Direct element focus (guarantees we see the scale effect)
    // Focus the FIRST card — critical for left/top clipping detection
    await focusNth(cardSelector, 0);
    await screenshot('home-first-card-focused');

    // Focus the SECOND card
    await focusNth(cardSelector, 1);
    await screenshot('home-second-card-focused');

    // Focus a card further in the row
    await focusNth(cardSelector, 3);
    await screenshot('home-mid-row-focused');

    // Focus a card in the second row (if rails exist)
    // Estimate: if there are 5+ items per row, item 6+ is row 2
    const secondRowIndex = await page.evaluate((sel) => {
      const cards = document.querySelectorAll(sel);
      if (cards.length < 4) return -1;
      const firstTop = cards[0].getBoundingClientRect().top;
      for (let i = 1; i < cards.length; i++) {
        if (cards[i].getBoundingClientRect().top > firstTop + 50) return i;
      }
      return Math.min(5, cards.length - 1);
    }, cardSelector);

    if (secondRowIndex > 0) {
      await focusNth(cardSelector, secondRowIndex);
      await screenshot('home-second-row-focused');
    }

    // Scroll down by focusing elements lower on the page
    const lastIndex = Math.min(await page.evaluate((sel) => document.querySelectorAll(sel).length - 1, cardSelector), 15);
    if (lastIndex > 6) {
      await focusNth(cardSelector, lastIndex);
      await screenshot('home-scroll-far-focused');
    }

    // === NAVIGATION TESTING ===
    // Try to open navigation (drawer/tab click or keyboard shortcut)
    const navOpened = await page.evaluate(() => {
      // Look for drawer toggle, hamburger menu, or nav links
      const toggle = document.querySelector('[data-testid*="menu"], [data-testid*="drawer"], [aria-label*="menu"], [aria-label*="Menu"]');
      if (toggle) { toggle.click(); return true; }
      // Try clicking a nav tab if tabs exist
      const tab = document.querySelector('[role="tab"], [role="tablist"] > *');
      if (tab) { tab.click(); return true; }
      return false;
    });
    await new Promise(r => setTimeout(r, 1000));
    if (navOpened) await screenshot('nav-open');

    // Visit other screens by clicking nav items directly
    const navItems = await page.evaluate(() => {
      const items = document.querySelectorAll('[role="tab"], [role="menuitem"], [data-testid*="nav"], a[href]');
      return items.length;
    });

    for (let i = 0; i < Math.min(navItems, ${Math.min(routeCount, 4)}); i++) {
      await page.evaluate((idx) => {
        const items = document.querySelectorAll('[role="tab"], [role="menuitem"], [data-testid*="nav"], a[href]');
        if (items[idx]) items[idx].click();
      }, i);
      await new Promise(r => setTimeout(r, 1500));
      await screenshot('screen-' + (i + 1));

      // Focus a card on this screen too
      await focusNth(cardSelector, 0);
      await screenshot('screen-' + (i + 1) + '-card-focused');

      // Go back (Backspace = TV back button in web)
      await page.keyboard.press('Backspace');
      await new Promise(r => setTimeout(r, 800));
    }

    // === DETAIL VIEW ===
    // Go back to home (Backspace = TV back button in web)
    await page.keyboard.press('Backspace');
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate((sel) => {
      const cards = document.querySelectorAll(sel);
      if (cards[0]) cards[0].click();
    }, cardSelector);
    await new Promise(r => setTimeout(r, 1500));
    await screenshot('detail-view');

    // Go back from detail
    await page.keyboard.press('Backspace');
    await new Promise(r => setTimeout(r, 1000));
    await screenshot('home-after-back');

    // === RESPONSIVE CHECK (720p) ===
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto('http://localhost:19007', { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1500));
    await screenshot('home-720p');
    await focusNth(cardSelector, 0);
    await screenshot('home-720p-first-focused');

    console.log('\\nTotal screenshots: ' + shotIndex);
    console.log('Focusable elements: ' + focusableCount);
    console.log('Card selector used: ' + cardSelector);
  } catch(e) {
    console.error('Error: ' + e.message);
    await screenshot('error-state');
  }

  await browser.close();
})();

Run: cd ${ctx.outDir} && node visual-check.cjs 2>&1

If puppeteer is not available:
Run: npm install --prefix ${ctx.outDir} puppeteer 2>&1 | tail -5
Then re-run the script.

## STEP 2.5: Pre-scan and fix focus-scale clipping (COMMON TV BUG)

TV apps have THREE layers that can clip focused elements. You must fix ALL of them.

Run: grep -rn "overflow.*hidden\\|overflow.*scroll" ${ctx.appDir}/packages/shared-ui/src/ --include="*.tsx" --include="*.ts" | head -30
Run: grep -rn "transform.*scale\\|scaleX\\|scaleY\\|focused.*scale" ${ctx.appDir}/packages/shared-ui/src/ --include="*.tsx" --include="*.ts" | head -20
Run: grep -rn "borderWidth.*focused\\|border.*focus" ${ctx.appDir}/packages/shared-ui/src/ --include="*.tsx" --include="*.ts" | head -20
Run: grep -rn "FlatList\\|ScrollView\\|DrawerContentScrollView" ${ctx.appDir}/packages/shared-ui/src/ --include="*.tsx" --include="*.ts" | head -20

### FIX LAYER 1: The card/tile element itself

If a card has overflow:'hidden' in its BASE style (for image border-radius clipping), the focus border and scale transform get clipped by the card's own bounds.

Fix: When the card is focused, override overflow to 'visible'. The unfocused state can keep overflow:'hidden' for image clipping.

BEFORE:
  highlightThumbnail: { overflow: 'hidden', borderRadius: 12 },
  highlightThumbnailFocused: { borderWidth: 6, transform: [{ scale: 1.1 }] }

AFTER:
  highlightThumbnail: { overflow: 'hidden', borderRadius: 12 },
  highlightThumbnailFocused: { overflow: 'visible', borderWidth: 6, transform: [{ scale: 1.1 }] }

Apply this to EVERY style that has both overflow:'hidden' AND a corresponding focused state with scale/border.

### FIX LAYER 2: The container (rail/row/grid)

The parent View/FlatList/ScrollView wrapping the cards must:
- Have overflow: 'visible'
- Have enough padding to accommodate the growth

Calculate padding needed:
- If card is 260px tall and scales to 1.1x, it grows 26px (13px each side)
- If card has a 6px focus border, add another 6px
- Total vertical padding needed: 13 + 6 = 19px minimum → use 24px to be safe
- Total horizontal paddingStart needed: (card_width * (scale-1) / 2) + borderWidth → for 420px card at 1.1x = 21 + 6 = 27px minimum

BEFORE:
  highlightsContainer: { paddingVertical: 10, overflow: 'visible' }

AFTER:
  highlightsContainer: { paddingVertical: 28, paddingStart: 30, overflow: 'visible' }

### FIX LAYER 3: ScrollViews and Drawer containers

DrawerContentScrollView and any ScrollView that contains focusable items with scale animations ALSO clip. Even with overflow:'visible' on the child, the ScrollView itself clips.

Fix: Add contentContainerStyle with overflow:'visible' AND add padding to accommodate scale.

For the Drawer specifically:
- The DrawerContentScrollView must have: contentContainerStyle={{ overflow: 'visible', paddingHorizontal: <scaleGrowth> }}
- The drawer container View must have overflow: 'visible'
- Menu items with scale(1.05) in a drawer of width W grow by W*0.05/2 on each side → add at least that much padding

BEFORE:
  <DrawerContentScrollView style={styles.container} scrollEnabled={false}>
    {/* menu items with scale(1.05) on focus */}
  </DrawerContentScrollView>

AFTER:
  <DrawerContentScrollView
    style={[styles.container, { overflow: 'visible' }]}
    scrollEnabled={false}
    contentContainerStyle={{ overflow: 'visible', paddingVertical: 8 }}
  >
    {/* menu items with scale(1.05) on focus */}
  </DrawerContentScrollView>

And for menu items, ensure marginHorizontal is large enough that the scaled item doesn't touch the drawer edges:
- If menu item is full-width minus 16px margin, and scales to 1.05x, the growth is (itemWidth * 0.05 / 2) ≈ 8-12px
- So marginHorizontal should be at least 16 + 12 = 28px, or reduce the item width

Also check TEXT OVERFLOW in menu items:
- Read the longest label text (e.g. "Categories", "Settings") and the menuItem paddingHorizontal
- When the item scales up, the text container also scales — if fontSize is large (36px+) and the drawer is narrow, text will overflow the rounded rectangle
- Fix: EITHER reduce fontSize to scaledPixels(28) OR increase the drawer width OR reduce paddingHorizontal so text has more room

### FIX LAYER 4: Container paddingTop for VirtualizedList/horizontal rows

SpatialNavigationVirtualizedList and horizontal FlatLists render inside a container. If that container has NO paddingTop, focused items that scale UP have their top edge clipped.

Find every gridContainer/listContainer/rowContainer that wraps a horizontal list and verify it has paddingTop equal to at least: (itemHeight * (scale - 1) / 2) + borderWidth.

BEFORE:
  gridContainer: { height: 280, overflow: 'visible' }

AFTER:
  gridContainer: { height: 280, overflow: 'visible', paddingTop: 16 }

(For a 200px tile at scale 1.08: growth = 200 * 0.08 / 2 = 8px + 4px border = 12px → use 16px paddingTop)

### Summary checklist

For EVERY element that has a focused-state scale transform, verify ALL layers:
1. ✅ The element itself: overflow:'visible' when focused
2. ✅ Its immediate container: overflow:'visible' + sufficient paddingTop/paddingBottom/paddingStart for scale growth
3. ✅ Any ScrollView/FlatList ancestor: overflow:'visible' on both style and contentContainerStyle
4. ✅ Text inside scaled elements: verify text doesn't overflow the container bounds at the larger scale (reduce font or increase container)

Read each file that has a scale transform and fix all layers. Do NOT skip any.

## STEP 3: Analyze every screenshot

Read EACH screenshot file captured above. For every image, check for ALL of the following defects:

### Layout Defects
- **Overlapping elements**: Any text, image, or component that overlaps another
- **Clipped/truncated content**: Text cut off mid-word, images cropped unexpectedly, tiles partially hidden
- **Focus-scale clipping**: When a card/tile is focused and scales up (transform: scale), its edges get CUT OFF by the parent container. This is a CRITICAL and COMMON defect in TV apps. Look for:
  - Top of focused card cropped (parent has overflow:hidden or no top padding)
  - Left edge of FIRST card in a row cropped (container has no left padding to accommodate scale)
  - Right edge of LAST card in a row cropped (same issue, right side)
  - Bottom of focused card cropped by the row below
- **Overflow**: Content spilling outside its container boundaries
- **Misalignment**: Elements that should be aligned (grid items, list items, headings) but are visually offset
- **Uneven spacing**: Inconsistent gaps between repeated elements (tiles in a rail, items in a grid)
- **Empty/blank regions**: Large areas of dead space that shouldn't be there, or screens that render nothing

### TV-Specific Defects (10ft UI)
- **Unsafe area violation**: Content rendered in the outer 5% margin (TV overscan area) — all content must be within the safe zone
- **Text too small**: Any text under ~24px equivalent (body) or ~18px (labels) — unreadable at 10ft
- **Low contrast**: Text or icons that don't have sufficient contrast against their background (especially on dark themes)
- **Missing focus indicator**: When an element is focused, there should be a visible highlight/ring/scale change
- **Focus indicator too subtle**: Focus states that exist but would be invisible from 10ft away

### Brand Correctness
- **Wrong colors**: UI not using brand primary (${brand.primary_color}), accent (${brand.accent_color}), or background (${brand.background_color})
- **Template default colors still visible**: Generic/default theme colors that weren't replaced
- **Inconsistent theme**: Some parts of the UI using brand colors, others still on defaults

### Component Issues
- **Broken images**: Image placeholders showing, broken image icons, or blank image areas
- **Stacking errors**: Z-index issues where backgrounds cover foreground content, or modals hidden behind other elements
- **Scroll artifacts**: Ghost elements, duplicated rows, or visual tearing in scroll areas
- **Navigation chrome issues**: Nav bar overlapping content, tabs/drawer covering screen elements

## STEP 4: Attempt fixes for CRITICAL defects found in screenshots

If you find critical defects (overlapping, clipping, overscan violations), attempt to fix them:

For each critical defect:
1. Identify which component/screen file causes the issue
2. Read the file
3. Fix the layout issue:
   - **Focus-scale clipping** → overflow:'visible' + padding on container (see Step 2.5 pattern)
   - **Overlap** → fix z-index, adjust margins, or fix flex layout
   - **Overscan** → add safe-area padding (min 48px on all edges for TV)
   - **Misalignment** → fix flex properties (alignItems, justifyContent)
   - **Text clipping** → numberOfLines prop, or increase container height
4. Save the file

After ALL fixes, re-capture screenshots and re-analyze:
Run: cd ${ctx.outDir} && node visual-check.cjs 2>&1

Read the new screenshots. For each previously-broken screen, confirm the fix worked. If a defect persists after one fix attempt, note it as "unresolved" in the report — do not loop more than twice.

## STEP 5: Kill the dev server

Run: kill $(lsof -ti:19007) 2>/dev/null || true

## STEP 6: Write the visual correctness report

Write ${ctx.outDir}/visual-correctness-report.txt with this exact structure:

# Visual Correctness Report

## Summary
- Screenshots analyzed: <count>
- Critical defects: <count> (overlaps, clipping, overscan)
- Major defects: <count> (missing focus, low contrast, misalignment)
- Minor defects: <count> (spacing inconsistency, small visual glitches)
- Fixes applied: <count>
- Fixes verified: <count>

## Defects Found

### Critical
<list each with: screenshot name, description, location in UI, fix applied (yes/no)>

### Major
<list each>

### Minor
<list each>

## Screen-by-Screen Results
<for each screenshot: PASS/FAIL + issues found>

## Design Spec Compliance
- Brand colors applied: YES/NO
- Navigation style (${design.navigation_style}): CORRECT/INCORRECT
- Template (${design.template}): MATCHES/MISMATCH
- Hero visible: ${design.show_hero ? "EXPECTED" : "SHOULD BE HIDDEN"}
- Tile size (${design.tile_size}): CORRECT/INCORRECT
- TV safe area respected: YES/NO
- Focus indicators visible: YES/NO

## Overall Verdict: PASS / PARTIAL / FAIL

A PASS means zero critical defects and ≤2 minor defects.
A PARTIAL means no critical defects remain after fixes, but major defects exist.
A FAIL means critical defects could not be fixed.
`;
  },

  visual_smoke_test: (ctx) => {
    const screenshotDir = `${ctx.outDir}/screenshots`;
    const routes = ctx.spec?.navigation.routes ?? [];
    const routeNames = routes.map(r => r.id).join(", ");

    return `
Test the web version of the app: start it, screenshot every screen, test navigation and focus.

STEP 1: Start the Expo web dev server.
Run: cd ${ctx.appDir}/apps/expo-multi-tv && BROWSER=none EXPO_TV=1 npx expo start --web --port 19006 &
Run: sleep 8

Verify: curl -s http://localhost:19006 | head -5
If it fails, check the process output for errors and try to fix them.

STEP 2: Screenshot every screen.
Write and run this puppeteer script (save as ${ctx.outDir}/test-runner.js then run it):

const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1920,1080', '--disable-gpu']
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
  onPhaseEnd?: (phase: Phase, result: PhaseResult, cost?: number) => void;
  onTokens?: (tokens: number) => void;
  onLog?: (message: string) => void;
}

export class ClaudeOrchestrator {
  private state: SessionState;
  private skills: SkillLibrary;
  private log: RunLog;
  private input: HarnessInput;
  private events: HarnessEvents;
  private lastPhaseCost: number = 0;

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
    const buildPhases: Phase[] = ["simulator_build", "vega_build", "visual_correctness", "visual_smoke_test"];

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

  private async executePlanPhase(): Promise<PhaseResult> {
    const navStyle = this.input.design.navigation_style;
    const navTypeConstraint = navStyle === "hidden" ? "single" : navStyle === "tabs" ? "tabs" : "drawer";

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

IMPORTANT: The navigation.type MUST be "${navTypeConstraint}" — this is a hard constraint from the design system, do not override it.

Brief: ${this.input.prompt}

Content manifest summary: ${this.input.content.categories.length} categories, ${this.input.content.videos.length} videos, ${this.input.content.featured.length} featured

Brand: name="${this.input.brand.name}", primary=${this.input.brand.primary_color}, accent=${this.input.brand.accent_color}, bg=${this.input.brand.background_color}

Design: template="${this.input.design.template}", navigation="${navStyle}", hero=${this.input.design.show_hero ? "visible" : "hidden"}, tiles=${this.input.design.tile_size}`;

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

    return new Promise((resolve, reject) => {
      const child = spawnAsync(claudePath, [
        "-p", "-",
        "--allowedTools", "Bash,Read,Write,Edit",
        "--output-format", "json",
      ], {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, PATH: `${process.env.PATH}:${process.env.HOME}/.toolbox/bin` },
      });

      let stdout = "";
      let stderr = "";

      child.stdout!.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr!.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

      child.stdin!.write(prompt);
      child.stdin!.end();

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`claude CLI timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`claude CLI exited with ${code}: ${stderr.slice(0, 500)}`));
        } else {
          try {
            const parsed = JSON.parse(stdout);
            const usage = parsed.usage;
            if (usage) {
              const tokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
              this.state.tokensUsed += tokens;
              this.events.onTokens?.(tokens);
            }
            if (parsed.total_cost_usd) {
              this.lastPhaseCost = parsed.total_cost_usd;
            }
            resolve(parsed.result ?? "");
          } catch {
            resolve(stdout);
          }
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`claude CLI error: ${err.message}`));
      });
    });
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
