#!/usr/bin/env node

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync, execSync } from "node:child_process";

// Prevent perf_hooks buffer overflow warning from long-running TUI renders
const { performance: perf } = globalThis;
if (perf?.clearMeasures) {
  const perfCleaner = setInterval(() => { perf.clearMeasures(); perf.clearMarks(); }, 60_000);
  perfCleaner.unref();
}
import { TVAppHarness } from "./orchestrator.js";
import { ClaudeOrchestrator } from "./claude-orchestrator.js";
import { runDoctor, printDoctorReport } from "./doctor.js";
import { ReplayClient } from "./recorder.js";
import { SkillFetcher } from "./skill-fetcher.js";
import { SkillLibrary } from "./skill-library.js";
import {
  ContentManifestSchema,
  BrandKitSchema,
  RunConfigSchema,
  DesignTokensSchema,
} from "./types.js";

loadEnvFile();

const args = process.argv.slice(2);
const command = args[0];

function loadEnvFile(): void {
  const candidates = [
    resolve(".env"),
    resolve("..", "..", ".env"),
  ];

  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;

    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Don't override existing env vars
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
    break;
  }
}

async function main() {
  switch (command) {
    case "run":
      await ensureSkills();
      await runHarness();
      break;
    case "claude-run":
      await ensureSkills();
      await runWithClaude();
      break;
    case "doctor":
      await runDoctorCommand();
      break;
    case "replay":
      await runReplay();
      break;
    case "install-skills":
      await installSkills();
      break;
    case "update-skills":
      await updateSkills();
      break;
    case "add-screen":
      await ensureSkills();
      await addScreen();
      break;
    case "review":
      await ensureSkills();
      await reviewCode();
      break;
    default:
      printUsage();
      break;
  }
}

function loadInputs() {
  const exampleFlag = args.indexOf("--example");
  let inputDir: string;

  if (exampleFlag >= 0 && args[exampleFlag + 1]) {
    const exampleName = args[exampleFlag + 1];
    inputDir = resolve("examples", exampleName);
    if (!existsSync(inputDir)) {
      inputDir = resolve("..", "..", "examples", exampleName);
    }
  } else {
    inputDir = resolve(args[1] ?? ".");
  }

  const contentPath = join(inputDir, "content.json");
  const brandPath = join(inputDir, "brand.json");
  const runConfigPath = join(inputDir, "run.json");
  const promptPath = join(inputDir, "prompt.txt");
  const designPath = join(inputDir, "design.json");

  if (!existsSync(contentPath)) {
    console.error(`Missing content.json at ${contentPath}`);
    process.exit(1);
  }

  const content = ContentManifestSchema.parse(
    JSON.parse(readFileSync(contentPath, "utf-8"))
  );

  const brand = existsSync(brandPath)
    ? BrandKitSchema.parse(JSON.parse(readFileSync(brandPath, "utf-8")))
    : { name: "App", primary_color: "#1a1a2e", accent_color: "#e94560", background_color: "#16213e", font_family: "System", logo_path: "", splash_path: "" };

  const config = existsSync(runConfigPath)
    ? RunConfigSchema.parse(JSON.parse(readFileSync(runConfigPath, "utf-8")))
    : RunConfigSchema.parse({ platforms: ["androidtv", "appletv", "web"] });

  const design = existsSync(designPath)
    ? DesignTokensSchema.parse(JSON.parse(readFileSync(designPath, "utf-8")))
    : DesignTokensSchema.parse({});

  const prompt = existsSync(promptPath)
    ? readFileSync(promptPath, "utf-8").trim()
    : `A streaming app called "${content.title}". ${content.description}`;

  return { inputDir, content, brand, config, design, prompt };
}

async function runHarness() {
  const { content, brand, config, design, prompt } = loadInputs();

  const skillsDir = existsSync(resolve("skills")) ? resolve("skills") : resolve("..", "..", "skills");
  const workdir = resolve(".");

  const harness = new TVAppHarness(
    { prompt, content, brand, config, design, workdir, skillsDir }
  );

  console.log(`\n  TV App Harness — Agent SDK mode`);
  console.log(`  Prompt: ${prompt.slice(0, 80)}...`);
  console.log(`  Platforms: ${config.platforms.join(", ")}`);
  console.log(`  Design: ${design.template} (tiles: ${design.tile_size}, spacing: ${design.spacing})`);
  console.log(`  Skills dir: ${skillsDir}\n`);

  const { state, outDir } = await harness.run();

  console.log(`\n  Run complete.`);
  console.log(`  Output: ${outDir}`);
  console.log(`  Tokens used: ${state.tokensUsed}/${state.tokenBudget}`);
  console.log(`  Phases:`);

  for (const [phase, result] of state.phaseResults) {
    const icon = result.status === "success" ? "✓" : result.status === "degraded" ? "~" : "✗";
    console.log(`    ${icon} ${phase}: ${result.status} (${result.iterations} iterations)`);
  }
}

async function runWithClaude() {
  const { inputDir, content, brand, config, design, prompt } = loadInputs();

  const skillsDir = existsSync(resolve("skills")) ? resolve("skills") : resolve("..", "..", "skills");
  const workdir = resolve(".");

  const useTui = !process.argv.includes("--no-tui");

  if (useTui) {
    const { TUI } = await import("./tui.js");
    const { V1_PHASES } = await import("./types.js");

    const activePhases = V1_PHASES.filter((phase) => {
      if (process.argv.includes("--generate-only") && ["simulator_build", "vega_build", "visual_smoke_test"].includes(phase)) return false;
      if (phase === "vega_build") return !config.platforms.includes("firetv-vega");
      return true;
    });

    const tui = new TUI(
      brand.name,
      config.platforms,
      { template: design.template, navigation_style: design.navigation_style },
      activePhases
    );
    tui.start();

    const harness = new ClaudeOrchestrator(
      { prompt, content, brand, config, design, workdir, skillsDir },
      {
        onPhaseStart: (phase) => tui.setPhase(phase),
        onPhaseEnd: (phase, result, cost) => tui.phaseComplete(phase, result, cost),
        onTokens: (tokens) => tui.addTokens(tokens),
        onLog: (msg) => tui.log(msg),
      }
    );

    const { state, outDir } = await harness.run();
    const failed = [...state.phaseResults.values()].some(r => r.status === "failed" && state.phaseResults.keys().next().value === "plan");
    tui.finish(failed ? "failed" : "done");
    tui.log(`Output: ${outDir}`);
  } else {
    const harness = new ClaudeOrchestrator(
      { prompt, content, brand, config, design, workdir, skillsDir }
    );

    console.log(`\n  TV App Harness (Claude CLI mode)`);
    console.log(`  Prompt: ${prompt.slice(0, 80)}...`);
    console.log(`  Platforms: ${config.platforms.join(", ")}`);
    console.log(`  Design: ${design.template} (tiles: ${design.tile_size}, spacing: ${design.spacing})`);
    console.log(`  Skills dir: ${skillsDir}\n`);

    const { state, outDir } = await harness.run();

    console.log(`\n  Run complete.`);
    console.log(`  Output: ${outDir}`);
    console.log(`  Phases:`);

    for (const [phase, result] of state.phaseResults) {
      const icon = result.status === "success" ? "✓" : result.status === "degraded" ? "~" : "✗";
      console.log(`    ${icon} ${phase}: ${result.status} (${result.iterations} iterations)`);
    }
  }
}

async function ensureSkills() {
  const fetcher = new SkillFetcher(resolve("../../skills"));
  if (!fetcher.isPopulated()) {
    console.log("  Fetching remote skills...");
    const { fetched, failed } = await fetcher.fetchAll();
    if (fetched.length > 0) {
      console.log(`  Fetched ${fetched.length} remote skills: ${fetched.join(", ")}`);
    }
    if (failed.length > 0) {
      console.log(`  Warning: ${failed.length} skills failed to fetch:`);
      for (const f of failed) console.log(`    - ${f}`);
    }
  }
}

async function installSkills() {
  const fetcher = new SkillFetcher(resolve("../../skills"));
  console.log("\n  Fetching remote skills...\n");
  const { fetched, failed } = await fetcher.fetchAll();
  for (const name of fetched) {
    console.log(`  ✓ ${name}`);
  }
  for (const f of failed) {
    console.log(`  ✗ ${f}`);
  }
  console.log(`\n  ${fetched.length} installed, ${failed.length} failed.\n`);
}

async function updateSkills() {
  const fetcher = new SkillFetcher(resolve("../../skills"));
  console.log("\n  Updating remote skills...\n");
  const { updated, failed } = await fetcher.update();
  for (const name of updated) {
    console.log(`  ✓ ${name}`);
  }
  for (const f of failed) {
    console.log(`  ✗ ${f}`);
  }
  console.log(`\n  ${updated.length} updated, ${failed.length} failed.\n`);
}

async function addScreen() {
  const screenName = args[1];
  if (!screenName) {
    console.error("  Usage: tv-harness add-screen <ScreenName> --type=<layout>");
    console.error("  Types: hero+rails, grid, detail, player, settings, search");
    process.exit(1);
  }

  const typeFlag = args.find((a) => a.startsWith("--type="));
  const layout = typeFlag?.split("=")[1] ?? "grid";
  const validLayouts = ["hero+rails", "grid", "detail", "player", "settings", "search"];
  if (!validLayouts.includes(layout)) {
    console.error(`  Invalid type "${layout}". Valid: ${validLayouts.join(", ")}`);
    process.exit(1);
  }

  const appDir = findAppDir();
  const skillsDir = resolveSkillsDir();
  const skills = loadSkillsForCommand(skillsDir, [
    "template-anatomy", "shared-ui-catalog", "rntv-focus-navigation", "10ft-ui"
  ]);

  const prompt = [
    skills,
    "",
    "## Your Task",
    "",
    `Add a new screen called "${screenName}" with layout type "${layout}" to the TV app at ${appDir}.`,
    "",
    "Steps:",
    `1. Create ${appDir}/packages/shared-ui/src/screens/${screenName}Screen.tsx`,
    `2. The screen should use the "${layout}" layout pattern`,
    "3. Import and use existing components from shared-ui where possible (check the components directory first)",
    "4. Make all interactive elements focusable using Pressable with onFocus/onBlur handlers",
    "5. Add the screen to the navigation — update the drawer/tab navigator to include a route for this screen",
    "6. Export the screen from the screens index file",
    "",
    "Use TVFocusGuideView for focus management. Ensure D-pad navigation works correctly.",
    "Follow the existing code patterns in the project.",
  ].join("\n");

  console.log(`\n  Adding screen: ${screenName} (${layout})\n`);
  invokeClaude(prompt, appDir);
  console.log(`\n  Screen "${screenName}" added.\n`);
}

async function reviewCode() {
  const appDir = findAppDir();
  const skillsDir = resolveSkillsDir();
  const skills = loadSkillsForCommand(skillsDir, [
    "template-anatomy", "shared-ui-catalog", "rntv-focus-navigation",
    "rntv-platform-detection", "10ft-ui"
  ]);

  const scope = args[1] ?? "";
  const scopeInstruction = scope
    ? `Focus your review on: ${scope}`
    : "Review the entire app for issues.";

  const prompt = [
    skills,
    "",
    "## Your Task",
    "",
    `Review the TV app code at ${appDir} for quality, correctness, and TV-specific issues.`,
    "",
    scopeInstruction,
    "",
    "Check for:",
    "1. Focus navigation issues — every interactive element must be focusable and reachable via D-pad",
    "2. TVFocusGuideView usage — focus traps where needed (modals, sidebars), autoFocus on containers",
    "3. Platform-specific code — Platform.isTV checks where TV behavior differs from mobile",
    "4. 10-foot UI compliance — text size (min 24px body), contrast ratios, safe area margins",
    "5. Performance — no unnecessary re-renders in lists, proper use of FlatList over ScrollView",
    "6. Missing error states — loading indicators, empty states, network error handling",
    "7. Accessibility — focus indicators visible, meaningful labels on Pressable elements",
    "",
    "For each issue found, report:",
    "- File and line number",
    "- What's wrong",
    "- How to fix it",
    "",
    "If you can fix issues directly (simple fixes), go ahead and edit the files.",
    "For architectural issues, just report them without changing code.",
  ].join("\n");

  console.log(`\n  Reviewing TV app code...\n`);
  const output = invokeClaude(prompt, appDir);
  console.log(output);
}

function findAppDir(): string {
  const appFlag = args.find((a) => a.startsWith("--app="));
  if (appFlag) {
    const dir = resolve(appFlag.split("=")[1]);
    if (existsSync(join(dir, "package.json"))) return dir;
  }

  const outDir = resolve("out");
  if (existsSync(outDir)) {
    const entries = readdirSync(outDir)
      .map((e) => ({ name: e, mtime: statSync(join(outDir, e)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (entries.length > 0) {
      const appPath = join(outDir, entries[0].name, "app");
      if (existsSync(join(appPath, "package.json"))) return appPath;
    }
  }

  if (existsSync(join(resolve("."), "package.json")) && existsSync(join(resolve("."), "apps"))) {
    return resolve(".");
  }

  console.error("  Could not find app directory. Use --app=<path> or run from within an app.");
  process.exit(1);
}

function resolveSkillsDir(): string {
  const candidates = [resolve("../../skills"), resolve("skills"), resolve("../skills")];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return resolve("../../skills");
}

function loadSkillsForCommand(skillsDir: string, skillNames: string[]): string {
  const lib = new SkillLibrary(skillsDir);
  const parts: string[] = [lib.alwaysLoad()];
  for (const name of skillNames) {
    const content = lib.loadSkill(name);
    if (content) parts.push(content);
  }
  return parts.join("\n\n");
}

function invokeClaude(prompt: string, cwd: string): string {
  const claudePath = process.env.CLAUDE_PATH ?? findClaudeBinary();

  const result = spawnSync(claudePath, [
    "-p", "-",
    "--allowedTools", "Bash,Read,Write,Edit",
  ], {
    cwd,
    input: prompt,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 600_000,
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

function findClaudeBinary(): string {
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

async function runDoctorCommand() {
  const results = await runDoctor();
  printDoctorReport(results);
}

async function runReplay() {
  const recordingPath = resolve(args[1] ?? "recording.json");
  if (!existsSync(recordingPath)) {
    console.error(`Recording not found: ${recordingPath}`);
    process.exit(1);
  }

  const client = new ReplayClient(recordingPath);
  console.log(`\n  Replaying ${client.total} turns from ${recordingPath}\n`);

  let turn = await client.nextResponse();
  while (turn) {
    console.log(`  Turn ${client.total - client.remaining}/${client.total} — ${turn.usage.input_tokens + turn.usage.output_tokens} tokens`);
    turn = await client.nextResponse();
  }

  console.log(`\n  Replay complete.\n`);
}

function printUsage() {
  console.log(`
  tv-harness — AI-orchestrated multi-platform TV app generator

  Commands:
    claude-run [dir]       Run full pipeline using Claude CLI
    run [dir]              Run full pipeline using Anthropic API (requires ANTHROPIC_API_KEY)
    add-screen <Name>      Add a screen to the generated app (--type=grid|hero+rails|detail|...)
    review [scope]         Review the generated app code for TV-specific issues
    doctor                 Check prerequisites
    replay <file>          Replay a recorded run
    install-skills         Fetch remote skills (react-native-tvos/skills etc.)
    update-skills          Re-fetch remote skills to get latest versions

  Options:
    --example <name>       Use a bundled example (e.g. cooking-shows)
    --generate-only        Skip simulator build phases
    --app=<path>           Specify app directory for add-screen/review

  Examples:
    npx tv-harness claude-run --example cooking-shows
    npx tv-harness add-screen Watchlist --type=grid
    npx tv-harness add-screen Home --type=hero+rails
    npx tv-harness review
    npx tv-harness review "focus navigation"
    npx tv-harness run ./my-app-inputs
`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message ?? err);
  process.exit(1);
});
