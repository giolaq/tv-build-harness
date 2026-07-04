import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { AgentSkills, Skill } from "@strands-agents/sdk/vended-plugins/skills";
import type { HarnessInput, Phase, SessionState } from "./types.js";
import type { HarnessConfig, PhaseSpec } from "./harness-config.js";
import type { PromptLoader } from "./prompt-loader.js";
import type { SkillLibrary } from "./skill-library.js";
import { buildDesignContext, buildPhaseInstructions } from "./phase-prompts.js";
import type { PhasePromptContext } from "./phase-prompts.js";

export function promptContext(input: {
  outDir: string;
  input: HarnessInput;
  state: SessionState;
  harness: HarnessConfig;
  prompts: PromptLoader;
}): PhasePromptContext {
  return {
    outDir: input.outDir,
    input: input.input,
    spec: input.state.spec,
    harness: input.harness,
    prompts: input.prompts,
    creativeSeed: input.state.creativeSeed,
  };
}

export function getPhaseInstructions(spec: PhaseSpec, ctx: PhasePromptContext): string | null {
  return buildPhaseInstructions(spec, ctx);
}

export function buildClaudeSkillContext(input: {
  spec: PhaseSpec;
  state: SessionState;
  harnessInput: HarnessInput;
  skills: SkillLibrary;
}): string {
  const meta = input.skills.alwaysLoad();
  const phaseSkills = input.skills.loadSkills(input.spec.skills);
  const skillsDir = input.harnessInput.skillsDir;

  return [
    "## Context: You are a TV app development agent.",
    "",
    "## App Spec",
    JSON.stringify(input.state.spec, null, 2),
    "",
    "## Design System",
    buildDesignContext(input.harnessInput.design),
    "",
    "## Skills (domain knowledge for this phase)",
    meta,
    ...phaseSkills,
    "",
    "## Auto-Skillify",
    "",
    "After completing your task, check: did you fix or discover a REUSABLE PATTERN that would prevent the same issue in future TV app generations?",
    "",
    "Rate the fix on reusability (1-5):",
    "1 = only applies to this exact app",
    "2 = might apply to similar apps",
    "3 = applies to most TV apps with this nav style",
    "4 = applies to ANY TV app using react-tv-space-navigation",
    "5 = universal React Native TV pattern",
    "",
    "Only skillify if score >= 4.",
    "",
    "Before creating, check for duplicates:",
    `Run: grep -rl "<main-keyword-of-your-fix>" ${skillsDir}/auto/ ${skillsDir}/ 2>/dev/null | head -5`,
    "If a similar skill exists, UPDATE it instead of creating a duplicate.",
    "",
    "If no duplicate and score >= 4, create:",
    `Run: mkdir -p ${skillsDir}/auto`,
    `Then write a file at ${skillsDir}/auto/<pattern-name>.md:`,
    "",
    "```",
    "---",
    "name: <kebab-case-name>",
    `applies_to: [${input.spec.name}]`,
    "meta:",
    `  created_by_run: ${input.state.runId}`,
    `  created_at: ${new Date().toISOString().slice(0, 10)}`,
    "  times_loaded: 0",
    "  times_defect_recurred: 0",
    "---",
    "",
    "# <Pattern Title>",
    "",
    "## Problem",
    "<What goes wrong and why>",
    "",
    "## Fix Pattern",
    "```typescript",
    "// BEFORE (broken)",
    "<code>",
    "",
    "// AFTER (fixed)",
    "<code>",
    "```",
    "",
    "## Gotchas",
    "- <Edge case or look-alike>",
    "```",
    "",
    "Do NOT skillify: app-specific content, one-off typos, issues already in loaded skills.",
    "",
    "FILE WRITE RESTRICTIONS: You may ONLY write/edit files in:",
    "1. The generated app directory (where you are working)",
    `2. ${skillsDir}/auto/ (for new skills ONLY)`,
    "NEVER modify files in src/, prompts/, or any harness source code.",
    "NEVER modify the harness package.json, tsconfig, or build files.",
    "You are testing and improving the GENERATED APP, not the harness itself.",
  ].join("\n");
}

export function buildSdkSystemPrompt(input: {
  spec: PhaseSpec;
  state: SessionState;
  harnessInput: HarnessInput;
  skills?: SkillLibrary;
  strands?: boolean;
}): string {
  const parts = [
    "You are a TV app development agent. You have access to specialized TV app tools.",
    "Execute the current phase by using the appropriate tools.",
    input.strands ? "Use the `skills` tool to load domain knowledge when needed — available skills are listed in <available_skills>." : "Prefer the specialized tools when they fit, but use Bash/Edit for file modifications.",
    "",
    "## App Spec",
    JSON.stringify(input.state.spec, null, 2),
    "",
    "## Design System",
    buildDesignContext(input.harnessInput.design),
  ];

  if (input.skills) {
    parts.push(
      "",
      "## Skills (domain knowledge)",
      input.skills.alwaysLoad(),
      ...input.skills.loadSkills(input.spec.skills)
    );
  }

  return parts.join("\n");
}

export function buildAgentPhaseUserMessage(input: {
  phase: Phase;
  state: SessionState;
  harnessInput: HarnessInput;
  harness: HarnessConfig;
  concise?: boolean;
}): string {
  const { phase, state, harnessInput, harness } = input;
  const appDir = join(state.workdir, "app");
  const contentManifest = input.concise
    ? JSON.stringify(harnessInput.content, null, 2)
    : JSON.stringify(harnessInput.content, null, 2);

  const messages: Record<string, string> = {
    scaffold: `Clone the react-native-multi-tv-app-sample template into "${appDir}" and install dependencies. App name: "${state.spec?.app_name}".`,
    branding: `Apply branding to the app at ${appDir}. Brand: name="${harnessInput.brand.name}", primary=${harnessInput.brand.primary_color}, accent=${harnessInput.brand.accent_color}, bg=${harnessInput.brand.background_color}, font=${harnessInput.brand.font_family}. Find and edit the theme token files in packages/shared-ui/. Update app.json with the app name.`,
    content: input.concise
      ? `Wire this content manifest into the app at ${appDir}.\n\nYou MUST do ALL of these steps:\n1. Write the content JSON to packages/shared-ui/src/data/content.json\n2. Create data hooks in packages/shared-ui/src/data/useContent.ts\n3. CRITICAL: Find the existing screen files and REPLACE their old data imports with the new useContent hooks.\n4. Update the screen rendering to use the new data shape\n\nContent manifest:\n${contentManifest}`
      : `Wire this content manifest into the app at ${appDir}.

You MUST do ALL of these steps:
1. Write the content JSON to packages/shared-ui/src/data/content.json
2. Create data hooks in packages/shared-ui/src/data/useContent.ts (useFeatured, useCategories, useVideosByCategory, useVideoById, useVideos)
3. CRITICAL: Find the existing screen files (especially HomeScreen.tsx) and REPLACE their old data imports. The template uses "fetchMoviesData" or "moviesData" — you must replace these with your new useContent hooks. grep for "moviesData|fetchMovies|sampleData|mockData" in the screens directory and update every file that uses old data.
4. Update the screen rendering to use the new data shape (Video type with: id, title, description, thumbnail_url, stream_url, stream_type, duration_sec, tags)

Content manifest:
${contentManifest}`,
    screens: input.concise
      ? `Customize screens at ${appDir}/packages/shared-ui/src/screens/ per the AppSpec. Only rename or modify EXISTING screen files. Do NOT import screens that don't exist.`
      : `Customize screens at ${appDir}/packages/shared-ui/src/screens/ per the AppSpec. IMPORTANT: Only rename or modify EXISTING screen files. Do NOT import screens that don't exist. First run: ls packages/shared-ui/src/screens/ to see what's available. After edits, run: npx tsc --noEmit to verify no broken imports.`,
    navigation: input.concise
      ? `Update navigation at ${appDir}/packages/shared-ui/src/navigation/. Navigation type: ${state.spec?.navigation.type}. Routes: ${JSON.stringify(state.spec?.navigation.routes)}`
      : buildNavigationPrompt(appDir, state, harnessInput),
    verify: `Run type checking at ${appDir}: npx tsc --noEmit. Fix any errors.`,
    build_loop: `Build the app at ${appDir} for platforms: ${state.config.platforms.join(", ")}. Use expo prebuild for iOS/Android.`,
    vega_setup_check: `Prepare the Vega app at ${appDir}/apps/vega. Check Kepler CLI, Amazon Devices Builder Tools MCP status, VDA availability, the Vega manifest, and forbidden shared-ui imports such as react-native-video, expo-font, and expo-image. Use the amazon_devices_builder_tools tool first.`,
    vega_build_loop: `Build the Vega OS variant at ${appDir}/apps/vega.`,
    vega_perf_trace: `Analyze Vega launch/render performance for ${appDir}/apps/vega. Use Amazon Devices Builder Tools MCP analyze_perfetto_traces when configured. Budgets: TTFF <= ${harness.vega.ttff_ms_max}ms, TTFD <= ${harness.vega.ttfd_ms_max}ms, JS frame drop <= ${harness.vega.max_js_frame_drop_percent}%. Write vega-perf-summary.md in ${state.workdir}.`,
    vega_hot_functions: `Analyze Vega CPU hot functions for ${appDir}/apps/vega. Use Amazon Devices Builder Tools MCP get_app_hot_functions when configured. Budget: top app-owned hot function <= ${harness.vega.max_hot_function_percent}% CPU share. Write vega-hot-functions.md in ${state.workdir}.`,
    visual_smoke_test: `Verify build artifacts exist at ${appDir} and capture screenshots from any running simulators.`,
  };

  return messages[phase] ?? `Execute phase: ${phase}`;
}

export function buildNavigationPrompt(appDir: string, state: SessionState, input: HarnessInput): string {
  const spec = state.spec;
  if (!spec) return "No AppSpec. Skip.";

  const navType = spec.navigation.type;
  const navStyle = input.design.navigation_style;
  const resolvedType = navStyle === "hidden" ? "hidden" : navType;

  const routesList = spec.navigation.routes.map(r =>
    `- id="${r.id}", label="${r.label}"${r.icon ? `, icon="${r.icon}"` : ""}`
  ).join("\n");

  let typeInstruction = "";
  if (resolvedType === "tabs") {
    typeInstruction = "The template uses a drawer — REPLACE it with a top tab navigator. Install @react-navigation/material-top-tabs if needed (yarn workspace add). Create a tab navigator with tabBarPosition:'top', remove drawer imports and CustomDrawerContent.";
  } else if (resolvedType === "hidden") {
    typeInstruction = "REMOVE visible navigation. Replace the drawer with a plain Stack navigator. No tabs, no drawer — users navigate by selecting content. Remove hamburger icons and drawer toggles.";
  } else {
    typeInstruction = "Keep the drawer navigator. Update its items to match the routes below.";
  }

  return `Update navigation at ${appDir}/packages/shared-ui/src/navigation/.

Navigation type: ${resolvedType}
${typeInstruction}

Routes:
${routesList}

IMPORTANT: Only reference screens that ACTUALLY EXIST. First run: ls packages/shared-ui/src/screens/ to check. Do NOT import non-existent screens. After edits, run: npx tsc --noEmit to confirm it compiles.`;
}

export function buildStrandsSkillsPlugin(skillsDir: string, spec: PhaseSpec): AgentSkills {
  const skillSources: (string | Skill)[] = [];

  for (const skillName of ["meta", ...spec.skills]) {
    const skillDirPath = join(skillsDir, skillName);
    const skillFlatPath = join(skillsDir, `${skillName}.md`);
    if (existsSync(join(skillDirPath, "SKILL.md"))) {
      skillSources.push(Skill.fromFile(skillDirPath, { strict: false }));
    } else if (existsSync(skillFlatPath)) {
      skillSources.push(Skill.fromContent(readFileSync(skillFlatPath, "utf-8"), { strict: false }));
    }
  }

  const autoDir = join(skillsDir, "auto");
  if (existsSync(autoDir)) {
    for (const file of readdirSync(autoDir).filter(f => f.endsWith(".md"))) {
      skillSources.push(Skill.fromContent(readFileSync(join(autoDir, file), "utf-8"), { strict: false }));
    }
  }

  return new AgentSkills({ skills: skillSources, strict: false });
}
