#!/usr/bin/env node

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";

// Prevent perf_hooks buffer overflow warning from long-running TUI renders
const { performance: perf } = globalThis;
if (perf?.clearMeasures) {
  const perfCleaner = setInterval(() => { perf.clearMeasures(); perf.clearMarks(); }, 60_000);
  perfCleaner.unref();
}
import { TVAppHarness } from "./executors/agent-sdk.js";
import { ClaudeOrchestrator } from "./executors/claude-cli.js";
import { runDoctor, printDoctorReport } from "./doctor.js";
import { costFromResponse, ReplayClient } from "./recorder.js";
import { SkillLibrary } from "./skill-library.js";
import { SkillFetcher } from "./skill-fetcher.js";
import { loadHarnessConfig } from "./harness-config.js";
import type { HarnessConfig } from "./harness-config.js";
import { selectActivePhases } from "./pipeline-engine.js";
import { findResumableRun } from "./checkpoint.js";
import { resolveClaude, invokeClaude } from "./claude-cli.js";
import type { PhaseMessage } from "./executors/claude-cli.js";
import {
  ContentManifestSchema,
  BrandKitSchema,
  RunConfigSchema,
  DesignTokensSchema,
  ScreenTreeSchema,
} from "./types.js";
import type { Phase, PhaseResult } from "./types.js";
import type { TypeOf, ZodError, ZodTypeAny } from "zod";

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
      if (args.includes("--plan")) {
        printResolvedPlan();
        break;
      }
      await runHarness();
      break;
    case "claude-run":
      if (args.includes("--plan")) {
        printResolvedPlan();
        break;
      }
      await runWithClaude();
      break;
    case "doctor":
      await runDoctorCommand();
      break;
    case "vega-doctor":
      await runVegaDoctorCommand();
      break;
    case "replay":
      await runReplay();
      break;
    case "add-screen":
      await addScreen();
      break;
    case "review":
      await reviewCode();
      break;
    case "test-ui":
      await testUI();
      break;
    case "visual-qa":
      await runVisualQA();
      break;
    case "serve":
      await startServe();
      break;
    case "install-skills":
      await installSkills();
      break;
    case "update-skills":
      await updateSkills();
      break;
    case "prune-skills":
      await pruneSkills();
      break;
    case "consolidate-skills":
      await consolidateSkills();
      break;
    default:
      printUsage();
      break;
  }
}

function formatZodError(err: ZodError, file: string): string {
  const lines = err.issues.slice(0, 10).map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "(root)";
    return `    - ${path}: ${issue.message}`;
  });
  const more = err.issues.length > 10 ? `\n    ... and ${err.issues.length - 10} more` : "";
  return `  Invalid ${file}:\n${lines.join("\n")}${more}`;
}

function parseInputFile<S extends ZodTypeAny>(path: string, schema: S, label: string): TypeOf<S> {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (err) {
    console.error(`  ${label} is not valid JSON: ${err instanceof Error ? err.message : err}\n  File: ${path}`);
    process.exit(1);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    console.error(formatZodError(result.error, label));
    console.error(`  File: ${path}`);
    process.exit(1);
  }
  return result.data;
}

// Flags that consume the next argument as their value.
const VALUE_FLAGS = new Set(["--example", "--config", "--from-phase", "--type", "--speed"]);
// --resume takes an optional value (a runId, never starting with --).
const OPTIONAL_VALUE_FLAGS = new Set(["--resume"]);

function positionalArgs(): string[] {
  const positional: string[] = [];
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      if (VALUE_FLAGS.has(arg)) i++;
      else if (OPTIONAL_VALUE_FLAGS.has(arg) && args[i + 1] && !args[i + 1].startsWith("--")) i++;
      continue;
    }
    positional.push(arg);
  }
  return positional;
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
    if (!existsSync(inputDir)) {
      console.error(`  Example "${exampleName}" not found. Bundled examples: ${listExamples().join(", ")}`);
      process.exit(1);
    }
  } else {
    inputDir = resolve(positionalArgs()[0] ?? ".");
  }

  const contentPath = join(inputDir, "content.json");
  const brandPath = join(inputDir, "brand.json");
  const runConfigPath = join(inputDir, "run.json");
  const promptPath = join(inputDir, "prompt.txt");
  const designPath = join(inputDir, "design.json");

  if (!existsSync(contentPath)) {
    console.error(`  Missing content.json at ${contentPath}`);
    console.error(`  The harness needs a content manifest. Start from an example: --example cooking-shows`);
    process.exit(1);
  }

  const content = parseInputFile(contentPath, ContentManifestSchema, "content.json");

  const brand = existsSync(brandPath)
    ? parseInputFile(brandPath, BrandKitSchema, "brand.json")
    : { name: "App", primary_color: "#1a1a2e", accent_color: "#e94560", background_color: "#16213e", font_family: "System", logo_path: "", splash_path: "" };

  const config = existsSync(runConfigPath)
    ? parseInputFile(runConfigPath, RunConfigSchema, "run.json")
    : RunConfigSchema.parse({ platforms: ["androidtv", "appletv", "web"] });

  const design = existsSync(designPath)
    ? parseInputFile(designPath, DesignTokensSchema, "design.json")
    : DesignTokensSchema.parse({});

  const screensPath = join(inputDir, "screens.json");
  const screenTree = existsSync(screensPath)
    ? parseInputFile(screensPath, ScreenTreeSchema, "screens.json")
    : undefined;

  const prompt = existsSync(promptPath)
    ? readFileSync(promptPath, "utf-8").trim()
    : `A streaming app called "${content.title}". ${content.description}`;

  const harness = loadHarness(inputDir);

  return { inputDir, content, brand, config, design, screenTree, prompt, harness };
}

function loadHarness(inputDir: string): HarnessConfig {
  const configFlag = args.indexOf("--config");
  const explicitPath = configFlag >= 0 && args[configFlag + 1] ? resolve(args[configFlag + 1]) : undefined;
  try {
    const { config, source } = loadHarnessConfig({ explicitPath, inputDir });
    if (source !== "defaults") {
      console.log(`  Using harness config: ${source}`);
    }
    return config;
  } catch (err) {
    console.error(`  Failed to load harness config: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

function printResolvedPlan(): void {
  const { config, harness } = loadInputs();
  const generateOnly = args.includes("--generate-only");
  const { active } = selectActivePhases(harness.phases, {
    platforms: config.platforms,
    generateOnly,
  });

  console.log(JSON.stringify(active, null, 2));
}

function listExamples(): string[] {
  for (const dir of [resolve("examples"), resolve("..", "..", "examples")]) {
    if (existsSync(dir)) {
      return readdirSync(dir).filter((e) => statSync(join(dir, e)).isDirectory());
    }
  }
  return [];
}

async function runHarness() {
  // Check for required API key based on provider config
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenRouterKey = !!process.env.OPENROUTER_API_KEY;
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  const hasAWSAuth = !!process.env.AWS_PROFILE || !!process.env.AWS_ACCESS_KEY_ID;

  if (!hasAnthropicKey && !hasOpenRouterKey && !hasOpenAIKey && !hasAWSAuth) {
    console.error(`  No API credentials found for API mode.`);
    console.error(`  Set one of: ANTHROPIC_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY, or AWS_PROFILE`);
    console.error(`  Or use claude-run mode, which uses your local Claude CLI session instead.`);
    process.exit(1);
  }

  const { content, brand, config, design, screenTree, prompt, harness: harnessConfig } = loadInputs();

  const skillsDir = existsSync(resolve("skills")) ? resolve("skills") : resolve("..", "..", "skills");
  const workdir = resolve(".");
  const generateOnly = args.includes("--generate-only");
  const useTui = !args.includes("--no-tui") && process.stdout.isTTY;

  const input = { prompt, content, brand, config, design, screenTree, workdir, skillsDir, harness: harnessConfig };

  const { StrandsOrchestrator } = await import("./executors/strands.js");
  const { selectActivePhases } = await import("./pipeline-engine.js");

  const { active } = selectActivePhases(harnessConfig.phases, {
    platforms: config.platforms,
    generateOnly,
  });

  if (useTui) {
    const { TUI } = await import("./tui.js");
    const tui = new TUI(
      brand.name,
      config.platforms,
      { template: design.template, navigation_style: design.navigation_style },
      active.map((p) => p.name)
    );
    tui.start();

    const harness = new StrandsOrchestrator(input, {
      onPhaseStart: (phase) => tui.setPhase(phase),
      onPhaseEnd: (phase, result, cost) => tui.phaseComplete(phase, result, cost),
      onTokens: (tokens) => tui.addTokens(tokens),
      onIteration: (phase, current, max) => tui.setIteration(phase, current, max),
      onLog: (msg) => tui.log(msg),
      onPhaseMessage: (phase, msg) => tui.addPhaseMessage(phase, msg),
    });

    const { state, outDir } = await harness.run({ generateOnly });
    const failed = [...state.phaseResults.values()].some(r => r.status === "failed");
    tui.finish(failed ? "failed" : "done");
    tui.log(`Output: ${outDir}`);
  } else {
    const harness = new StrandsOrchestrator(input, {
      onPhaseStart: (phase) => console.log(`\n  Phase: ${phase}`),
      onPhaseEnd: (phase, result, cost) => {
        const icon = result.status === "success" ? "✓" : "✗";
        console.log(`  ${icon} ${phase}: ${result.status}${cost ? ` ($${cost.toFixed(4)})` : ""}`);
        if (result.error) console.log(`    ${result.error}`);
      },
      onLog: (msg) => console.log(`  ${msg}`),
    });

    console.log(`\n  TV Build — Strands SDK mode`);
    console.log(`  Platforms: ${config.platforms.join(", ")}`);

    const { state, outDir } = await harness.run({ generateOnly });
    console.log(`\n  Output: ${outDir}`);
  }
}

async function runWithClaude() {
  if (!resolveClaude()) {
    console.error(`  The "claude" CLI was not found on this machine — claude-run mode needs it.`);
    console.error(`  Fix: npm install -g @anthropic-ai/claude-code   (or set CLAUDE_PATH=/path/to/claude)`);
    console.error(`  Or use API mode instead: tv-build run (requires ANTHROPIC_API_KEY).`);
    process.exit(1);
  }

  const { content, brand, config, design, screenTree, prompt, harness: harnessConfig } = loadInputs();

  const skillsDir = existsSync(resolve("skills")) ? resolve("skills") : resolve("..", "..", "skills");
  const workdir = resolve(".");
  const generateOnly = args.includes("--generate-only");
  const record = !args.includes("--no-record");

  const fromFlag = args.indexOf("--from-phase");
  const fromPhase = fromFlag >= 0 ? args[fromFlag + 1] : undefined;

  // --resume [runId]: pick up a previous run from its checkpoint.
  let resumeDir: string | null = null;
  const resumeFlag = args.indexOf("--resume");
  if (resumeFlag >= 0) {
    const runId = args[resumeFlag + 1]?.startsWith("--") ? undefined : args[resumeFlag + 1];
    resumeDir = findResumableRun(workdir, runId);
    if (!resumeDir) {
      console.error(`  No resumable run found${runId ? ` for runId "${runId}"` : ""} under ${join(workdir, "out")}.`);
      console.error(`  A run is resumable once at least one phase has completed (checkpoint.json exists).`);
      process.exit(1);
    }
  }

  const input = { prompt, content, brand, config, design, screenTree, workdir, skillsDir, harness: harnessConfig };
  const useTui = !args.includes("--no-tui");

  const makeOrchestrator = (events: ConstructorParameters<typeof ClaudeOrchestrator>[1]) =>
    resumeDir
      ? ClaudeOrchestrator.resume(resumeDir, input, events, { record })
      : new ClaudeOrchestrator(input, events, { record });

  const resumeBanner = (harness: ClaudeOrchestrator) =>
    `Resuming ${resumeDir}${fromPhase
      ? ` (redoing from: ${fromPhase})`
      : ` (skipping: ${[...harness.getResumedPhases()].join(", ") || "none"})`}`;

  if (useTui) {
    const { TUI } = await import("./tui.js");
    const { selectActivePhases } = await import("./pipeline-engine.js");

    const { active } = selectActivePhases(harnessConfig.phases, {
      platforms: config.platforms,
      generateOnly,
    });

    const tui = new TUI(
      brand.name,
      config.platforms,
      { template: design.template, navigation_style: design.navigation_style },
      active.map((p) => p.name)
    );
    tui.start();

    const harness = makeOrchestrator({
      onPhaseStart: (phase) => tui.setPhase(phase),
      onPhaseEnd: (phase, result, cost) => tui.phaseComplete(phase, result, cost),
      onTokens: (tokens) => tui.addTokens(tokens),
      onIteration: (phase, current, max) => tui.setIteration(phase, current, max),
      onLog: (msg) => tui.log(msg),
      onPhaseMessage: (phase, msg) => tui.addPhaseMessage(phase, msg),
    });

    if (resumeDir) tui.log(resumeBanner(harness));

    const { state, outDir } = await harness.run({ generateOnly, fromPhase });
    const failed = [...state.phaseResults.values()].some(r => r.status === "failed" && state.phaseResults.keys().next().value === "plan");
    tui.finish(failed ? "failed" : "done");
    tui.log(`Output: ${outDir}`);
  } else {
    const harness = makeOrchestrator({});

    console.log(`\n  TV Build (Claude CLI mode)`);
    console.log(`  Prompt: ${prompt.slice(0, 80)}...`);
    console.log(`  Platforms: ${config.platforms.join(", ")}`);
    console.log(`  Design: ${design.template} (tiles: ${design.tile_size}, spacing: ${design.spacing})`);
    console.log(`  Skills dir: ${skillsDir}`);
    if (resumeDir) console.log(`  ${resumeBanner(harness)}`);
    console.log();

    const { state, outDir } = await harness.run({ generateOnly, fromPhase });

    console.log(`\n  Run complete.`);
    console.log(`  Output: ${outDir}`);
    console.log(`  Phases:`);

    for (const [phase, result] of state.phaseResults) {
      const icon = result.status === "success" ? "✓" : result.status === "degraded" ? "~" : "✗";
      console.log(`    ${icon} ${phase}: ${result.status} (${result.iterations} iterations)`);
    }
  }
}


async function addScreen() {
  const screenName = positionalArgs()[0];
  if (!screenName) {
    console.error("  Usage: tv-build add-screen <ScreenName> --type=<layout>");
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
    "template-anatomy", "shared-ui-catalog", "10ft-ui"
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
  await invokeClaude({ prompt, cwd: appDir });
  console.log(`\n  Screen "${screenName}" added.\n`);
}

async function reviewCode() {
  const appDir = findAppDir();
  const skillsDir = resolveSkillsDir();
  const skills = loadSkillsForCommand(skillsDir, [
    "template-anatomy", "shared-ui-catalog", "10ft-ui"
  ]);

  const scope = positionalArgs()[0] ?? "";
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
  const output = (await invokeClaude({ prompt, cwd: appDir })).text;
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

async function runDoctorCommand() {
  const results = await runDoctor({ vega: args.includes("--vega") });
  printDoctorReport(results, args.includes("--fix"));
}

async function runVegaDoctorCommand() {
  const appDir = args.some((arg) => arg.startsWith("--app=")) ? findAppDir() : undefined;
  const results = await runDoctor({ vega: true, appDir });
  printDoctorReport(results, args.includes("--fix"));
}

async function runReplay() {
  const recordingPath = resolveReplayRecording(positionalArgs()[0]);
  if (!existsSync(recordingPath)) {
    console.error(`Recording not found: ${recordingPath}`);
    process.exit(1);
  }

  const speed = replaySpeed();
  const client = new ReplayClient(recordingPath, { speed });
  const summary = client.totals;
  const useTui = !args.includes("--no-tui") && process.stdout.isTTY;

  if (useTui) {
    const { TUI } = await import("./tui.js");
    const tui = new TUI(
      "Recorded run",
      ["replay"],
      { template: "recording", navigation_style: "recording" },
      client.phases,
      { tokenBudget: Math.max(summary.tokens, 1), modeLabel: "REPLAY" }
    );
    tui.start();
    await replayTurns(client, {
      onPhaseStart: (phase) => tui.setPhase(phase),
      onPhaseMessage: (phase, message) => tui.addPhaseMessage(phase, message),
      onUsage: (phase, tokens, cost, phaseCost) => {
        tui.addTokens(tokens);
        tui.addCost(cost);
        tui.setPhaseCost(phase, phaseCost);
      },
      onPhaseEnd: (phase, result) => tui.phaseComplete(phase, result),
    });
    tui.finish("done");
  } else {
    console.log(`\n  REPLAY ${client.total} turns from ${recordingPath}`);
    console.log(`  Speed: ${speed}x\n`);
    await replayTurns(client, {
      onTurn: (index, total, phase, tokens, cost) => {
        console.log(`  Turn ${index}/${total} ${phase} — ${tokens} tokens, $${cost.toFixed(4)}`);
      },
    });
  }

  console.log(`\n  Replay complete. Turns: ${client.total}. Tokens: ${summary.tokens.toLocaleString()}. Cost: $${summary.costUsd.toFixed(4)}.\n`);
}

function resolveReplayRecording(arg?: string): string {
  if (!arg) return resolve("recording.json");

  const direct = resolve(arg);
  if (existsSync(direct)) return direct;

  if (arg.includes("/") || arg.includes("\\") || arg.endsWith(".json")) return direct;

  const fixtureCandidates = [
    resolve("docs", "course", "fixtures", arg, "recording.json"),
    resolve("..", "..", "docs", "course", "fixtures", arg, "recording.json"),
  ];
  return fixtureCandidates.find((candidate) => existsSync(candidate)) ?? fixtureCandidates[0];
}

function replaySpeed(): number {
  const equals = args.find((arg) => arg.startsWith("--speed="));
  const value = equals?.slice("--speed=".length) ?? (args.includes("--speed") ? args[args.indexOf("--speed") + 1] : undefined);
  const speed = value ? Number(value) : 1;
  return Number.isFinite(speed) && speed > 0 ? speed : 1;
}

async function replayTurns(
  client: ReplayClient,
  events: {
    onTurn?: (index: number, total: number, phase: Phase, tokens: number, cost: number) => void;
    onPhaseStart?: (phase: Phase) => void;
    onPhaseMessage?: (phase: Phase, message: PhaseMessage) => void;
    onUsage?: (phase: Phase, tokens: number, cost: number, phaseCost: number) => void;
    onPhaseEnd?: (phase: Phase, result: PhaseResult) => void;
  }
): Promise<void> {
  let activePhase: Phase | null = null;
  const phaseTurns = new Map<Phase, number>();
  const phaseCosts = new Map<Phase, number>();

  let turn = await client.nextTurn();
  while (turn) {
    const phase = turn.phase;
    if (activePhase !== phase) {
      if (activePhase) completeReplayPhase(activePhase, phaseTurns, events);
      activePhase = phase;
      events.onPhaseStart?.(phase);
    }

    const tokens = turn.usage.input_tokens + turn.usage.output_tokens;
    const cost = costFromResponse(turn.response);
    const phaseCost = (phaseCosts.get(phase) ?? 0) + cost;
    phaseCosts.set(phase, phaseCost);
    phaseTurns.set(phase, (phaseTurns.get(phase) ?? 0) + 1);

    for (const message of replayMessages(turn.response)) {
      events.onPhaseMessage?.(phase, message);
    }

    events.onUsage?.(phase, tokens, cost, phaseCost);
    events.onTurn?.(client.total - client.remaining, client.total, phase, tokens, cost);
    turn = await client.nextTurn();
  }

  if (activePhase) completeReplayPhase(activePhase, phaseTurns, events);
}

function completeReplayPhase(
  phase: Phase,
  phaseTurns: Map<Phase, number>,
  events: { onPhaseEnd?: (phase: Phase, result: PhaseResult) => void }
): void {
  events.onPhaseEnd?.(phase, {
    phase,
    status: "success",
    iterations: phaseTurns.get(phase) ?? 1,
  });
}

function replayMessages(response: unknown): PhaseMessage[] {
  const events = Array.isArray(response) ? response : [response];
  const messages: PhaseMessage[] = [];

  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const typed = event as {
      type?: string;
      message?: { content?: unknown };
      content?: unknown;
      result?: unknown;
    };

    if (typed.type === "assistant" && Array.isArray(typed.message?.content)) {
      for (const block of typed.message.content) {
        if (!block || typeof block !== "object") continue;
        const item = block as { type?: string; text?: unknown; input?: unknown; name?: string };
        if (item.type === "text" && typeof item.text === "string") {
          messages.push({ type: "text", content: item.text });
        } else if (item.type === "tool_use") {
          const content = typeof item.input === "string"
            ? item.input.slice(0, 200)
            : JSON.stringify(item.input ?? "").slice(0, 200);
          messages.push({ type: "tool_use", content, toolName: item.name });
        }
      }
    } else if (typed.type === "tool_result" || (typed.type === "user" && typed.message?.content)) {
      const content = typed.message?.content ?? typed.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (!block || typeof block !== "object") continue;
          const item = block as { type?: string; content?: unknown; tool_use_id?: string };
          if (item.type === "tool_result" && item.content) {
            const text = typeof item.content === "string"
              ? item.content.slice(0, 300)
              : JSON.stringify(item.content).slice(0, 300);
            messages.push({ type: "tool_result", content: text, toolName: item.tool_use_id });
          }
        }
      }
    } else if (typed.type === "result" && typeof typed.result === "string" && messages.length === 0) {
      messages.push({ type: "text", content: typed.result.slice(0, 300) });
    }
  }

  return messages;
}

async function runVisualQA() {
  const outDir = findOutDir();
  const skillsDir = resolveSkillsDir();

  const specPath = join(outDir, "spec.json");
  if (!existsSync(specPath)) {
    console.error(`  No spec.json found in ${outDir}. Run a full generation first.`);
    process.exit(1);
  }

  const config = RunConfigSchema.parse({ platforms: ["web"] });
  const brand = BrandKitSchema.parse({ name: "App", primary_color: "#1a1a2e", accent_color: "#e94560", background_color: "#16213e", font_family: "System", logo_path: "", splash_path: "" });
  const design = DesignTokensSchema.parse({});
  const content = { title: "App", description: "", categories: [], videos: [], featured: [] } as any;

  const harness = ClaudeOrchestrator.fromExistingRun(
    outDir,
    { prompt: "", content, brand, config, design, workdir: resolve("."), skillsDir },
    {
      onLog: (msg) => console.log(`  ${msg}`),
      onIteration: (_, cur, max) => console.log(`  Iteration ${cur}/${max}`),
    }
  );

  console.log(`\n  Visual QA Loop — reusing ${outDir}\n`);
  const result = await harness.runVisualQAOnly();

  const icon = result.status === "success" ? "✓" : result.status === "degraded" ? "~" : "✗";
  console.log(`\n  ${icon} visual_qa_loop: ${result.status} (${result.iterations} iterations)`);
  if (result.error) console.log(`  Error: ${result.error}`);
  console.log();
}

async function installSkills() {
  const skillsDir = resolveSkillsDir();
  const fetcher = new SkillFetcher(skillsDir);
  const result = await fetcher.fetchAll();
  console.log(`\n  Skills installed into ${fetcher.getCacheDir()}`);
  console.log(`  Fetched: ${result.fetched.length ? result.fetched.join(", ") : "none"}`);
  if (result.failed.length) {
    console.log(`  Failed: ${result.failed.join("; ")}`);
    process.exitCode = 1;
  }
  console.log();
}

async function updateSkills() {
  const skillsDir = resolveSkillsDir();
  const fetcher = new SkillFetcher(skillsDir);
  const result = await fetcher.update();
  console.log(`\n  Skills updated in ${fetcher.getCacheDir()}`);
  console.log(`  Updated: ${result.updated.length ? result.updated.join(", ") : "none"}`);
  if (result.failed.length) {
    console.log(`  Failed: ${result.failed.join("; ")}`);
    process.exitCode = 1;
  }
  console.log();
}

async function pruneSkills() {
  const skillsDir = resolveSkillsDir();
  const lib = new SkillLibrary(skillsDir);
  const stats = lib.getAutoSkillStats();

  if (stats.length === 0) {
    console.log("\n  No auto-skills found in skills/auto/\n");
    return;
  }

  console.log("\n  Auto-Skill Effectiveness Report\n");
  console.log("  Name                          Loaded  Recurred  Status");
  console.log("  " + "─".repeat(65));

  const flagged: typeof stats = [];

  for (const s of stats) {
    const ratio = s.timesLoaded > 0 ? s.timesRecurred / s.timesLoaded : 0;
    let status = "✓ effective";
    if (s.timesLoaded === 0) {
      status = "○ unused";
      flagged.push(s);
    } else if (ratio > 0.5) {
      status = "✗ ineffective";
      flagged.push(s);
    } else if (s.timesLoaded >= 3 && s.timesRecurred === 0) {
      status = "★ promote candidate";
    }
    console.log(`  ${s.name.padEnd(30)} ${String(s.timesLoaded).padEnd(8)} ${String(s.timesRecurred).padEnd(10)} ${status}`);
  }

  console.log();
  if (flagged.length > 0) {
    console.log(`  ${flagged.length} skill(s) flagged for review.`);
    if (process.argv.includes("--auto")) {
      for (const s of flagged) {
        const { unlinkSync } = await import("node:fs");
        unlinkSync(s.filePath);
        console.log(`  Deleted: ${s.name}`);
      }
    } else {
      console.log("  Run with --auto to delete flagged skills automatically.");
    }
  } else {
    console.log("  All skills are performing well.");
  }
  console.log();
}

async function consolidateSkills() {
  const skillsDir = resolveSkillsDir();
  const lib = new SkillLibrary(skillsDir);
  const autoSkills = lib.listSkills("auto");

  if (autoSkills.length < 3) {
    console.log("\n  Need at least 3 auto-skills to consolidate. Currently: " + autoSkills.length + "\n");
    return;
  }

  // Group by applies_to overlap
  const groups: Map<string, typeof autoSkills> = new Map();
  for (const skill of autoSkills) {
    const key = skill.applies_to.sort().join(",") || "general";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(skill);
  }

  const dryRun = process.argv.includes("--dry-run");

  console.log("\n  Skill Consolidation" + (dryRun ? " (dry run)" : "") + "\n");

  for (const [group, skills] of groups) {
    if (skills.length < 3) continue;
    console.log(`  Group [${group}]: ${skills.length} skills`);
    for (const s of skills) {
      console.log(`    - ${s.name}`);
    }
    if (!dryRun) {
      console.log(`    → Merge these ${skills.length} skills using: npx tv-build claude-run with a merge prompt`);
      console.log(`    (Automatic LLM merging not yet implemented — manual review recommended)`);
    }
    console.log();
  }

  if (dryRun) {
    console.log("  Run without --dry-run to perform consolidation.\n");
  }
}

function findOutDir(): string {
  const appFlag = args.find((a) => a.startsWith("--app="));
  if (appFlag) {
    const dir = resolve(appFlag.split("=")[1]);
    if (existsSync(join(dir, "spec.json"))) return dir;
    // If they pointed at the app subdir, go up one level
    const parent = resolve(dir, "..");
    if (existsSync(join(parent, "spec.json"))) return parent;
  }

  // Find the most recent out/ directory
  const outDir = resolve("out");
  if (existsSync(outDir)) {
    const entries = readdirSync(outDir)
      .map((e) => ({ name: e, mtime: statSync(join(outDir, e)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (entries.length > 0) {
      return join(outDir, entries[0].name);
    }
  }

  console.error("  Could not find output directory. Use --app=<path-to-out/runId>");
  process.exit(1);
}

async function testUI() {
  const appDir = findAppDir();
  const { runUITests } = await import("./ui-test-runner.js");
  await runUITests(appDir, { keepOpen: !process.argv.includes("--close") });
}

async function startServe() {
  const portFlag = args.find((a) => a.startsWith("--port="));
  const port = portFlag ? parseInt(portFlag.split("=")[1]) : 3001;
  const skillsDir = resolveSkillsDir();
  const examplesDir = existsSync(resolve("examples")) ? resolve("examples") : resolve("..", "..", "examples");

  const { startServer } = await import("./server.js");
  startServer({ port, workdir: resolve("."), skillsDir, examplesDir });
}

function printUsage() {
  console.log(`
  tv-build — AI-orchestrated multi-platform TV app generator

  Commands:
    claude-run [dir]       Run full pipeline using Claude CLI
    run [dir]              Run full pipeline using Anthropic API (requires ANTHROPIC_API_KEY)
    test-ui                Open a visible browser and run the UI test sequence in real time
    visual-qa              Run only the visual QA loop on an existing generated app
    install-skills         Fetch configured remote skills into the local cache
    update-skills          Refresh configured remote skills
    add-screen <Name>      Add a screen to the generated app (--type=grid|hero+rails|detail|...)
    review [scope]         Review the generated app code for TV-specific issues
    doctor                 Check prerequisites
    vega-doctor            Check Vega SDK, VDA, manifest, and Amazon Devices Builder Tools
    replay <file|fixture>  Replay a recorded run

  Options:
    --example <name>       Use a bundled example (e.g. cooking-shows)
    --generate-only        Skip simulator build phases
    --resume [runId]       Resume a previous run from its checkpoint (latest if no runId)
    --from-phase <name>    Skip phases before <name> (use with --resume to rerun a phase)
    --config <path>        Use a harness.config.json (custom template/phases/skills/models)
    --plan                 Print the resolved active PhaseSpec[] and exit
    --no-tui               Plain console output instead of the TUI
    --no-record            Disable recording.json creation in claude-run mode
    --speed <x>            With replay: divide stored turn delays by this multiplier
    --app=<path>           Specify app directory for add-screen/review/test-ui
    --close                Close browser after test-ui completes (default: stay open)
    --fix                  With doctor: print exact fix commands for failing checks

  Customizing (harness.config.json — in your input dir or passed via --config):
    {
      "template": { "repo": "https://github.com/you/your-tv-template.git" },
      "models": { "plan": "claude-opus-4-6", "execution": "claude-sonnet-4-6" },
      "tokenBudget": 500000,
      "phases": [
        { "name": "branding", "skills": ["template-anatomy", "my-theming"] },
        { "name": "my-phase", "prompt": "my-phase", "insertAfter": "content",
          "verify": [{ "type": "grep", "pattern": "{{content.title}}", "path": "src/" }] }
      ]
    }

  Examples:
    npx tv-build claude-run --example cooking-shows
    npx tv-build claude-run --resume
    npx tv-build claude-run --resume d811afcb --from-phase navigation
    npx tv-build test-ui
    npx tv-build test-ui --app=./my-app --close
    npx tv-build visual-qa
    npx tv-build vega-doctor --fix
    npx tv-build visual-qa --app=out/d811afcb
    npx tv-build add-screen Watchlist --type=grid
    npx tv-build add-screen Home --type=hero+rails
    npx tv-build review
    npx tv-build review "focus navigation"
    npx tv-build run ./my-app-inputs
`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message ?? err);
  process.exit(1);
});
