#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { TVAppHarness } from "./orchestrator.js";
import { ClaudeOrchestrator } from "./claude-orchestrator.js";
import { ToolRegistry } from "./tool-registry.js";
import { registerAllTools } from "./tools/index.js";
import { runDoctor, printDoctorReport } from "./doctor.js";
import { ReplayClient } from "./recorder.js";
import {
  ContentManifestSchema,
  BrandKitSchema,
  RunConfigSchema,
} from "./types.js";

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case "run":
      await runHarness();
      break;
    case "claude-run":
      await runWithClaude();
      break;
    case "doctor":
      await runDoctorCommand();
      break;
    case "replay":
      await runReplay();
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

  const prompt = existsSync(promptPath)
    ? readFileSync(promptPath, "utf-8").trim()
    : `A streaming app called "${content.title}". ${content.description}`;

  return { inputDir, content, brand, config, prompt };
}

async function runHarness() {
  const { content, brand, config, prompt } = loadInputs();

  const skillsDir = resolve("skills");
  const workdir = resolve(".");

  const registry = new ToolRegistry();
  registerAllTools(registry);

  const harness = new TVAppHarness(
    { prompt, content, brand, config, workdir, skillsDir },
    registry
  );

  console.log(`\n  TV App Harness — Starting run`);
  console.log(`  Prompt: ${prompt.slice(0, 80)}...`);
  console.log(`  Platforms: ${config.platforms.join(", ")}`);
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
  const { inputDir, content, brand, config, prompt } = loadInputs();

  const skillsDir = resolve("skills");
  const workdir = resolve(".");

  const harness = new ClaudeOrchestrator(
    { prompt, content, brand, config, workdir, skillsDir }
  );

  console.log(`\n  TV App Harness (Claude CLI mode)`);
  console.log(`  Prompt: ${prompt.slice(0, 80)}...`);
  console.log(`  Platforms: ${config.platforms.join(", ")}`);
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
    run [dir]              Run using Anthropic API directly (requires ANTHROPIC_API_KEY)
    claude-run [dir]       Run using Claude CLI (easier — just needs 'claude' installed)
    run --example <name>   Run with a bundled example (e.g. cooking-shows)
    doctor                 Check prerequisites
    replay <file>          Replay a recorded run

  Examples:
    npx tv-harness claude-run --example cooking-shows
    npx tv-harness run --example cooking-shows
    npx tv-harness doctor
    npx tv-harness run ./my-app-inputs
`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message ?? err);
  process.exit(1);
});
