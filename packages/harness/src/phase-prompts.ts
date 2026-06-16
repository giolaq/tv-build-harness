import { join } from "node:path";
import type { AppSpec, DesignTokens, HarnessInput } from "./types.js";
import type { HarnessConfig, PhaseSpec } from "./harness-config.js";
import type { PromptLoader } from "./prompt-loader.js";

export interface PhasePromptContext {
  outDir: string;
  input: HarnessInput;
  spec: AppSpec | null;
  harness: HarnessConfig;
  prompts: PromptLoader;
}

/**
 * Builds the task instructions for a phase by loading its prompt file and
 * computing the input-derived variables it needs. Built-in phases get bespoke
 * variable sets; custom config-defined phases get the generic bag.
 */
export function buildPhaseInstructions(phaseSpec: PhaseSpec, ctx: PhasePromptContext): string | null {
  const { input, spec, harness, prompts } = ctx;
  const appDir = join(ctx.outDir, "app");
  const phase = phaseSpec.prompt ?? phaseSpec.name;

  switch (phase) {
    case "scaffold":
      return prompts.load("scaffold", {
        appDir,
        appName: spec?.app_name ?? input.content.title,
        templateRepo: harness.template.repo,
        templateBranch: harness.template.branch ? ` --branch ${harness.template.branch}` : "",
      });

    case "branding": {
      const appName = spec?.app_name ?? input.content.title;
      const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const bundleId = "com.tvharness." + appName.toLowerCase().replace(/[^a-z0-9]/g, "");
      return prompts.load("branding", {
        appDir,
        appName,
        slug,
        bundleId,
        primaryColor: input.brand.primary_color,
        accentColor: input.brand.accent_color,
        backgroundColor: input.brand.background_color,
        fontFamily: input.brand.font_family || "System (no change needed)",
      });
    }

    case "content":
      return prompts.load("content", {
        appDir,
        contentManifest: JSON.stringify(input.content, null, 2),
        featuredIds: JSON.stringify(input.content.featured),
        categoryNames: JSON.stringify(input.content.categories.map(c => c.name)),
        videoCount: String(input.content.videos.length),
        contentTitle: input.content.title,
      });

    case "screens": {
      if (!spec) return "No AppSpec available. Skip this phase.";
      const screensList = spec.screens.map(s =>
        `- ${s.id}: layout="${s.layout}", route="${s.route}"${s.uses_template_screen ? `, reuses="${s.uses_template_screen}"` : ""}`
      ).join("\n");
      const isDrawer = spec.navigation.type === "drawer";
      return prompts.load("screens", {
        appDir,
        screensList,
        hasDrawer: isDrawer ? "true" : "",
        noDrawer: isDrawer ? "" : "true",
      });
    }

    case "creative_ui":
      return prompts.load("creative_ui", {
        appDir,
        appName: spec?.app_name ?? input.content.title,
        prompt: input.prompt.slice(0, 200),
        primaryColor: input.brand.primary_color,
        accentColor: input.brand.accent_color,
        backgroundColor: input.brand.background_color,
      });

    case "navigation": {
      if (!spec) return "No AppSpec available. Skip this phase.";
      const navStyle = input.design.navigation_style;
      const resolvedType = navStyle === "hidden" ? "hidden" : spec.navigation.type;

      const routesList = spec.navigation.routes.map(r =>
        `- id="${r.id}", label="${r.label}"${r.icon ? `, icon="${r.icon}"` : ""}`
      ).join("\n");

      // Per-navigation-type instructions live in their own prompt files
      // (navigation_drawer/tabs/hidden.md) so projects can override them.
      const variant = prompts.has(`navigation_${resolvedType}`) ? `navigation_${resolvedType}` : "navigation_drawer";
      const typeInstructions = prompts.load(variant, { appDir });

      return prompts.load("navigation", {
        appDir,
        resolvedType,
        routesList,
        typeInstructions,
      });
    }

    case "verify": {
      const isDrawerNav = spec?.navigation.type === "drawer";
      return prompts.load("verify", {
        appDir,
        hasDrawer: isDrawerNav ? "true" : "",
        noDrawer: isDrawerNav ? "" : "true",
      });
    }

    case "build_loop": {
      const platforms = input.config.platforms;
      const wantsAndroid = platforms.includes("androidtv") || platforms.includes("firetv-fos");
      const wantsIos = platforms.includes("appletv");
      return prompts.load("build_loop", {
        appDir,
        platforms: platforms.join(", "),
        wantsAndroid: wantsAndroid ? "true" : "",
        wantsIos: wantsIos ? "true" : "",
        iosStepNumber: wantsAndroid ? "4" : "3",
      });
    }

    case "android_test_loop": {
      const bundleId = "com.tvharness." + (spec?.app_name ?? input.content.title).toLowerCase().replace(/[^a-z0-9]/g, "");
      const atRoutes = spec?.navigation.routes ?? [];
      const routesList = atRoutes.map(r => r.label || r.id).join(", ");
      const screenshotDir = join(ctx.outDir, "screenshots");
      const avdName = "TV_API_34";
      return prompts.load("android_test_loop", {
        appDir,
        bundleId,
        routesList,
        screenshotDir,
        avdName,
      });
    }

    case "vega_build_loop":
      return prompts.load("vega_build_loop", { appDir });

    case "visual_correctness": {
      const routes = spec?.navigation.routes ?? [];
      return prompts.load("visual_correctness", {
        appDir,
        outDir: ctx.outDir,
        screenshotDir: `${ctx.outDir}/screenshots`,
        primaryColor: input.brand.primary_color,
        accentColor: input.brand.accent_color,
        backgroundColor: input.brand.background_color,
        navigationStyle: input.design.navigation_style,
        template: input.design.template,
        heroExpected: input.design.show_hero ? "EXPECTED" : "SHOULD BE HIDDEN",
        tileSize: input.design.tile_size,
        maxScreensToVisit: String(Math.min(routes.length, 4)),
      });
    }

    case "visual_smoke_test": {
      const routes = spec?.navigation.routes ?? [];
      return prompts.load("visual_smoke_test", {
        appDir,
        outDir: ctx.outDir,
        screenshotDir: `${ctx.outDir}/screenshots`,
        appName: spec?.app_name ?? "App",
        routeNames: routes.map(r => r.id).join(", "),
      });
    }

    default: {
      // Custom config-defined phases: load their prompt file with the
      // generic variable bag. No prompt file → no instructions.
      try {
        return prompts.load(phase, {
          appDir,
          outDir: ctx.outDir,
          appName: spec?.app_name ?? input.content.title,
          primaryColor: input.brand.primary_color,
          accentColor: input.brand.accent_color,
          backgroundColor: input.brand.background_color,
          contentTitle: input.content.title,
          platforms: input.config.platforms.join(", "),
          templateRepo: harness.template.repo,
        });
      } catch {
        return null;
      }
    }
  }
}

/** Builds the planner prompt: brief + content/brand/design summary + optional screen tree. */
export function buildPlanPrompt(ctx: PhasePromptContext): string {
  const { input, prompts } = ctx;
  const navStyle = input.design.navigation_style;
  const navTypeConstraint = navStyle === "hidden" ? "single" : navStyle === "tabs" ? "tabs" : "drawer";

  let screenTreeSection = "";
  if (input.screenTree) {
    const st = input.screenTree;
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

  return prompts.load("plan", {
    navTypeConstraint,
    screenTreeSection,
    brief: input.prompt,
    contentSummary: `${input.content.categories.length} categories, ${input.content.videos.length} videos, ${input.content.featured.length} featured`,
    brandName: input.brand.name,
    primaryColor: input.brand.primary_color,
    accentColor: input.brand.accent_color,
    backgroundColor: input.brand.background_color,
    template: input.design.template,
    navStyle,
    heroVisibility: input.design.show_hero ? "visible" : "hidden",
    tileSize: input.design.tile_size,
  });
}

/** Human-readable design-token summary injected into agent context. */
export function buildDesignContext(d: DesignTokens): string {
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
