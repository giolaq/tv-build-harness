#!/usr/bin/env node

import { cpSync, readFileSync, existsSync, readdirSync, statSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { resolve, join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

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
import { findResumableRun, loadCheckpoint } from "./checkpoint.js";
import { resolveClaude, invokeClaude } from "./claude-cli.js";
import type { HarnessEvents, PhaseMessage } from "./executors/claude-cli.js";
import type { TUI } from "./tui.js";
import { EXIT, isJsonMode, writeError, writeEvent, writeJson } from "./output.js";
import {
  ContentManifestSchema,
  BrandKitSchema,
  RunConfigSchema,
  DesignTokensSchema,
  ScreenTreeSchema,
} from "./types.js";
import type { HarnessInput, Phase, PhaseResult, SessionState } from "./types.js";
import { toJSONSchema } from "zod";
import type { TypeOf, ZodError, ZodTypeAny } from "zod";
import { findInputSchema, INPUT_SCHEMAS } from "./input-schemas.js";
import { abortRun, initRunStatus, outDirForRun, summarizeRun, updateRunStatus } from "./status.js";
import { validateInputDir } from "./validate.js";
import { checkTemplates } from "./template-check.js";
import { buildRefinePlan, executeRefine, RefineInputError } from "./refine.js";
import type { RefineOptions, RefinePlan, RefineResult } from "./refine.js";
import { runAndroidCommand } from "./commands/android.js";

loadEnvFile();

const args = process.argv.slice(2);
const command = args[0];
const jsonMode = isJsonMode(args);
type CommandHandler = () => void | Promise<void>;
type LoadedInputs = Omit<HarnessInput, "workdir" | "skillsDir" | "harness"> & {
  inputDir: string;
  harness: HarnessConfig;
};
type RunnableHarnessInput = HarnessInput & { harness: HarnessConfig };
type StrandsOrchestratorClass = typeof import("./executors/strands.js").StrandsOrchestrator;
type TuiClass = typeof import("./tui.js").TUI;

const COMMAND_HANDLERS: Record<string, CommandHandler> = {
  run: () => runCommand("run"),
  "claude-run": () => runCommand("claude-run"),
  doctor: runDoctorCommand,
  "vega-doctor": runVegaDoctorCommand,
  replay: runReplay,
  status: printRunStatus,
  logs: printRunLogs,
  abort: abortDetachedRun,
  refine: refineCommand,
  schema: printSchema,
  validate: validateInputsCommand,
  init: initInputsCommand,
  templates: templatesCommand,
  android: () => runAndroidCommand(args.slice(1), jsonMode),
  "add-screen": addScreen,
  review: reviewCode,
  "test-ui": testUI,
  "visual-qa": runVisualQA,
  serve: startServe,
  "install-skills": installSkills,
  "update-skills": updateSkills,
  "prune-skills": pruneSkills,
  "consolidate-skills": consolidateSkills,
};

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

      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    break;
  }
}

async function main() {
  rejectRemovedMaxCostFlag();
  const handler = command ? COMMAND_HANDLERS[command] : undefined;
  await (handler ?? printUsage)();
}

function runCommand(mode: "run" | "claude-run"): void | Promise<void> {
  if (args.includes("--plan")) return printResolvedPlan();
  if (args.includes("--detach")) return startDetachedRun(mode);
  return mode === "run" ? runHarness() : runWithClaude();
}

function refineCommand(): void | Promise<void> {
  return args.includes("--detach") ? startDetachedRefine() : runRefineCommand();
}

function templatesCommand(): void {
  if (args[1] !== "check") {
    fail("unknown_templates_command", "Unknown templates command.", "Run tv-build templates check.", EXIT.input);
  }
  const checks = checkTemplates();
  if (jsonMode) {
    writeJson({ command: "templates_check", templates: checks });
  } else {
    console.log("\n  Template Pins\n");
    console.log("  Status   Commit                                    Upstream HEAD                              Source");
    console.log("  -------  ----------------------------------------  ----------------------------------------  ------");
    for (const item of checks) {
      console.log(`  ${item.status.padEnd(7)}  ${item.commit.padEnd(40)}  ${(item.upstreamHead ?? "unknown").padEnd(40)}  ${item.source}`);
      console.log(`           ${item.repo}`);
    }
    console.log();
  }
  if (checks.some((item) => item.status === "unknown")) process.exitCode = EXIT.environment;
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
    fail("invalid_json", `${label} is not valid JSON: ${err instanceof Error ? err.message : err}`, `Fix ${path} and rerun tv-build ${command ?? "--help"}`, EXIT.input);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    fail("schema_validation_failed", `${formatZodError(result.error, label)}\nFile: ${path}`, `Run tv-build schema ${schemaNameForLabel(label)} --json to inspect the contract.`, EXIT.input);
  }
  return result.data;
}

function fail(code: string, message: string, hint: string, exitCode: number = EXIT.input): never {
  if (jsonMode) {
    writeError(code, message, hint);
  } else {
    console.error(`  ${message}`);
    console.error(`  Hint: ${hint}`);
  }
  process.exit(exitCode);
}

function schemaNameForLabel(label: string): string {
  return label.replace(".json", "").replace("harness.config", "config");
}

function humanLog(message = ""): void {
  if (jsonMode) console.error(message);
  else console.log(message);
}

const VALUE_FLAGS = new Set(["--example", "--config", "--from-phase", "--type", "--speed", "--seed", "--max-cost", "--run-id", "--from-example", "--phase"]);
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
  return loadResumeInputs() ?? loadInputsFromDirectory(resolveInputDir());
}

function loadResumeInputs(): LoadedInputs | undefined {
  const resuming = args.some((arg) => arg === "--resume" || arg.startsWith("--resume="));
  if (!resuming || valueFlag("--example") || positionalArgs().length > 0) return undefined;
  const resumeDir = findResumableRun(resolve("."), resumeRunId());
  const savedInputPath = resumeDir ? join(resumeDir, "input.json") : "";
  return savedInputPath && existsSync(savedInputPath)
    ? loadInputsFromSaved(savedInputPath)
    : undefined;
}

function resolveInputDir(): string {
  const exampleName = valueFlag("--example");
  if (!exampleName) return resolve(positionalArgs()[0] ?? ".");
  const inputDir = resolveExampleDir(exampleName);
  if (inputDir) return inputDir;
  fail(
    "example_not_found",
    `Example "${exampleName}" not found. Bundled examples: ${listExamples().join(", ")}`,
    "Run tv-build --help or pass an input directory path.",
    EXIT.input
  );
}

function loadInputsFromDirectory(inputDir: string): LoadedInputs {
  const contentPath = join(inputDir, "content.json");
  const brandPath = join(inputDir, "brand.json");
  const runConfigPath = join(inputDir, "run.json");
  const promptPath = join(inputDir, "prompt.txt");
  const designPath = join(inputDir, "design.json");

  if (!existsSync(contentPath)) {
    fail(
      "missing_content",
      `Missing content.json at ${contentPath}`,
      "Start from an example: tv-build init my-inputs --from-example cooking-shows",
      EXIT.input
    );
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

  const runId = runIdFlag();
  const creativeSeed = seedFlag();

  return { inputDir, content, brand, config, design, screenTree, prompt, harness, runId, creativeSeed };
}

function loadInputsFromSaved(savedInputPath: string): LoadedInputs {
  const raw = JSON.parse(readFileSync(savedInputPath, "utf-8"));
  const content = ContentManifestSchema.parse(raw.content);
  const brand = raw.brand ? BrandKitSchema.parse(raw.brand) : BrandKitSchema.parse({
    name: "App", primary_color: "#1a1a2e", accent_color: "#e94560", background_color: "#16213e", font_family: "System", logo_path: "", splash_path: "",
  });
  const config = raw.config ? RunConfigSchema.parse(raw.config) : RunConfigSchema.parse({ platforms: ["androidtv", "appletv", "web"] });
  const design = raw.design ? DesignTokensSchema.parse(raw.design) : DesignTokensSchema.parse({});
  const screenTree = raw.screenTree ? ScreenTreeSchema.parse(raw.screenTree) : undefined;
  const prompt = raw.prompt ?? `A streaming app called "${content.title}". ${content.description}`;
  const harness = raw.harness ? raw.harness as HarnessConfig : loadHarness(".");
  const runId = runIdFlag() ?? raw.runId;
  const creativeSeed = seedFlag() ?? raw.creativeSeed;
  return { inputDir: ".", content, brand, config, design, screenTree, prompt, harness, runId, creativeSeed };
}

function runIdFlag(): string | undefined {
  return valueFlag("--run-id");
}

function seedFlag(): string | undefined {
  return valueFlag("--seed");
}

function resumeRunId(): string | undefined {
  const equals = args.find((arg) => arg.startsWith("--resume="));
  if (equals) return equals.slice("--resume=".length).trim() || undefined;
  const index = args.indexOf("--resume");
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

function rejectRemovedMaxCostFlag(): void {
  if (args.some((arg) => arg === "--max-cost" || arg.startsWith("--max-cost="))) {
    fail(
      "removed_max_cost",
      "--max-cost has been removed; runs are uncapped.",
      "Remove --max-cost. Cost is still tracked and reported.",
      EXIT.input
    );
  }
}

function resolveRequestedResumeDir(baseDir: string): string | null {
  if (!args.some((arg) => arg === "--resume" || arg.startsWith("--resume="))) return null;
  const runId = resumeRunId();
  const resumeDir = findResumableRun(baseDir, runId);
  if (!resumeDir) {
    fail(
      "resume_not_found",
      `No resumable run found${runId ? ` for runId "${runId}"` : ""} under ${join(baseDir, "out")}.`,
      "Run a generation until at least one phase completes, then retry --resume.",
      EXIT.input
    );
  }
  return resumeDir;
}

function stripInternalRunId(argv: string[]): string[] {
  const cleaned: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--run-id") {
      i++;
      continue;
    }
    if (argv[i].startsWith("--run-id=")) continue;
    cleaned.push(argv[i]);
  }
  return cleaned;
}

function phaseFlag(): string | undefined {
  return valueFlag("--phase");
}

function startDetachedRun(mode: "run" | "claude-run"): void {
  requireDetachedConfirmation(
    "Detached JSON runs require --yes.",
    "Show the human `tv-build claude-run --plan --json`, then rerun with --detach --yes."
  );
  loadInputs();
  const resumeDir = resolveRequestedResumeDir(resolve("."));
  const runId = resumeDir ? basename(resumeDir) : randomUUID().slice(0, 8);
  const outDir = resumeDir ?? outDirForRun(resolve("."), runId);
  const pid = spawnDetached(outDir, detachedRunArgs(runId));
  initRunStatus(outDir, { runId, pid });
  printDetachedResult(`Detached ${mode} run`, runId, pid, outDir);
}

function startDetachedRefine(): void {
  requireDetachedConfirmation(
    "Detached JSON refines require --yes.",
    "Show the human `tv-build refine <target> --phase <phase> \"instruction\" --plan --json`, then rerun with --detach --yes."
  );
  const target = positionalArgs()[0];
  const instruction = positionalArgs().slice(1).join(" ").trim();
  if (!target || !instruction) {
    fail("missing_refine_args", "Missing refine target or instruction.", "Run tv-build refine <runId|appDir> --phase branding \"warmer hero\" --plan.", EXIT.input);
  }

  let plan;
  try {
    plan = buildRefinePlan({
      target,
      instruction,
      phase: phaseFlag(),
      rootDir: resolve("."),
      skillsDir: resolveSkillsDir(),
    });
  } catch (err) {
    if (err instanceof RefineInputError) fail(err.code, err.message, err.hint, EXIT.input);
    throw err;
  }

  const pid = spawnDetached(plan.outDir, requiredArgs(
    process.argv.slice(2).filter((arg) => arg !== "--detach"),
    ["--json"]
  ));
  initRunStatus(plan.outDir, { runId: plan.runId, pid });
  printDetachedResult("Detached refine for run", plan.runId, pid, plan.outDir);
}

function requireDetachedConfirmation(message: string, hint: string): void {
  if (jsonMode && !args.includes("--yes")) {
    fail("confirmation_required", message, hint, EXIT.input);
  }
}

function detachedRunArgs(runId: string): string[] {
  const childArgs = stripInternalRunId(process.argv.slice(2))
    .filter((arg) => arg !== "--detach" && arg !== "--yes");
  return [...requiredArgs(childArgs, ["--json", "--no-tui"]), "--run-id", runId];
}

function requiredArgs(argv: string[], required: string[]): string[] {
  const result = [...argv];
  for (const flag of required) {
    if (!result.includes(flag)) result.push(flag);
  }
  return result;
}

function spawnDetached(outDir: string, childArgs: string[]): number | undefined {
  mkdirSync(outDir, { recursive: true });
  const logFd = openSync(join(outDir, "run.log"), "a");
  const child = spawn(process.execPath, [...process.execArgv, process.argv[1], ...childArgs], {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: process.env,
  });
  child.unref();
  return child.pid;
}

function printDetachedResult(label: string, runId: string, pid: number | undefined, outDir: string): void {
  if (jsonMode) {
    writeJson({ command: "detach", runId, pid, out: outDir });
    return;
  }
  console.log(`${label} ${runId}`);
  console.log(`PID: ${pid}`);
  console.log(`Output: ${outDir}`);
}

function loadHarness(inputDir: string): HarnessConfig {
  const configFlag = args.indexOf("--config");
  const explicitPath = configFlag >= 0 && args[configFlag + 1] ? resolve(args[configFlag + 1]) : undefined;
  try {
    const { config, source } = loadHarnessConfig({ explicitPath, inputDir });
    if (source !== "defaults") {
      humanLog(`  Using harness config: ${source}`);
    }
    return config;
  } catch (err) {
    fail(
      "invalid_harness_config",
      `Failed to load harness config: ${err instanceof Error ? err.message : err}`,
      "Fix harness.config.json or rerun without --config.",
      EXIT.input
    );
  }
}

function printResolvedPlan(): void {
  const { config, harness } = loadInputs();
  const generateOnly = args.includes("--generate-only");
  const fromFlag = args.indexOf("--from-phase");
  const fromPhase = fromFlag >= 0 ? args[fromFlag + 1] : undefined;
  const resumeDir = resolveRequestedResumeDir(resolve("."));
  const checkpoint = resumeDir ? loadCheckpoint(resumeDir) : null;
  const { active, completed } = selectActivePhases(harness.phases, {
    platforms: config.platforms,
    generateOnly,
    fromPhase,
    resumedPhases: checkpoint ? new Set(checkpoint.completedPhases) : undefined,
  });
  const phases = active.filter((phase) => !completed.has(phase.name));

  if (jsonMode) {
    writeJson({
      command: "plan",
      phases,
      count: phases.length,
      generateOnly,
      resume: resumeDir ?? undefined,
      fromPhase,
      completedPhases: [...completed],
    });
  } else {
    console.log(JSON.stringify(phases, null, 2));
  }
}

function listExamples(): string[] {
  for (const dir of [resolve("examples"), resolve("..", "..", "examples")]) {
    if (existsSync(dir)) {
      return readdirSync(dir).filter((e) => statSync(join(dir, e)).isDirectory());
    }
  }
  return [];
}

function printSchema(): void {
  const name = positionalArgs()[0];
  if (!name) {
    const schemas = INPUT_SCHEMAS.map(({ name, file, description }) => ({ name, file, description }));
    if (jsonMode) {
      writeJson({ command: "schema", schemas });
      return;
    }

    console.log("\n  Available input schemas\n");
    for (const schema of schemas) {
      console.log(`  ${schema.name.padEnd(8)} ${schema.file.padEnd(22)} ${schema.description}`);
    }
    console.log();
    return;
  }

  const entry = findInputSchema(name);
  if (!entry) {
    fail(
      "schema_not_found",
      `Unknown schema "${name}". Available schemas: ${INPUT_SCHEMAS.map((schema) => schema.name).join(", ")}`,
      "Run tv-build schema to list available schemas.",
      EXIT.input
    );
  }

  const schema = toJSONSchema(entry.schema);
  if (jsonMode) {
    writeJson({
      command: "schema",
      name: entry.name,
      file: entry.file,
      description: entry.description,
      schema,
    });
    return;
  }

  console.log(`\n  ${entry.file} — ${entry.description}\n`);
  printJsonSchemaTable(schema as JsonSchemaObject);
}

interface JsonSchemaObject {
  type?: string | string[];
  properties?: Record<string, JsonSchemaObject>;
  required?: string[];
  description?: string;
  default?: unknown;
  enum?: unknown[];
  items?: JsonSchemaObject;
  anyOf?: JsonSchemaObject[];
  oneOf?: JsonSchemaObject[];
}

function printJsonSchemaTable(schema: JsonSchemaObject): void {
  console.log("  Field                 Type                Required  Description");
  console.log("  --------------------  ------------------  --------  -----------");
  const required = new Set(schema.required ?? []);
  for (const [field, property] of Object.entries(schema.properties ?? {})) {
    console.log(`  ${field.padEnd(20)}  ${jsonSchemaType(property).padEnd(18)}  ${(required.has(field) ? "yes" : "no").padEnd(8)}  ${property.description ?? ""}`);
  }
  console.log();
}

function jsonSchemaType(schema: JsonSchemaObject): string {
  if (schema.enum) return schema.enum.map(String).join(" | ");
  if (schema.type === "array") return `${schema.items ? jsonSchemaType(schema.items) : "unknown"}[]`;
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  if (schema.anyOf) return schema.anyOf.map(jsonSchemaType).join(" | ");
  if (schema.oneOf) return schema.oneOf.map(jsonSchemaType).join(" | ");
  return schema.type ?? "unknown";
}

function validateInputsCommand(): void {
  const inputDir = resolve(positionalArgs()[0] ?? ".");
  const configFlag = args.indexOf("--config");
  const explicitConfigPath = configFlag >= 0 && args[configFlag + 1] ? resolve(args[configFlag + 1]) : undefined;
  const result = validateInputDir(inputDir, explicitConfigPath);

  if (jsonMode) {
    writeJson({ command: "validate", inputDir, ...result });
  } else {
    console.log(`\n  Validation: ${inputDir}\n`);
    if (result.errors.length === 0) console.log("  Errors: none");
    else {
      console.log("  Errors:");
      for (const error of result.errors) console.log(`  - ${error.code}: ${error.message} (${error.hint})`);
    }
    if (result.warnings.length === 0) console.log("  Warnings: none");
    else {
      console.log("  Warnings:");
      for (const warning of result.warnings) console.log(`  - ${warning.code}: ${warning.message} (${warning.hint})`);
    }
    console.log();
  }

  if (result.errors.length > 0) process.exitCode = EXIT.input;
}

function initInputsCommand(): void {
  const target = positionalArgs()[0];
  if (!target) {
    fail("missing_init_dir", "Missing directory for init.", "Run tv-build init <dir>.", EXIT.input);
  }
  const dir = resolve(target);
  const force = args.includes("--force");
  if (existsSync(dir) && readdirSync(dir).length > 0 && !force) {
    fail("init_dir_not_empty", `Directory is not empty: ${dir}`, "Pass --force or choose an empty directory.", EXIT.input);
  }

  const fromExample = valueFlag("--from-example");
  if (fromExample) {
    const exampleDir = resolveExampleDir(fromExample);
    if (!exampleDir) {
      fail("example_not_found", `Example "${fromExample}" not found.`, "Run tv-build --help to inspect examples.", EXIT.input);
    }
    mkdirSync(dir, { recursive: true });
    cpSync(exampleDir, dir, { recursive: true, force });
  } else {
    writeStarterInputs(dir, args.includes("--custom-pipeline"));
  }

  const result = validateInputDir(dir);
  if (jsonMode) {
    writeJson({ command: "init", dir, ...result });
  } else {
    console.log(`Initialized ${dir}`);
    if (result.warnings.length > 0) {
      console.log("Warnings:");
      for (const warning of result.warnings) console.log(`- ${warning.code}: ${warning.message}`);
    }
  }
}

function valueFlag(flag: string): string | undefined {
  const equals = args.find((arg) => arg.startsWith(`${flag}=`));
  return equals?.slice(flag.length + 1) ?? (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
}

function resolveExampleDir(name: string): string | null {
  for (const root of [resolve("examples"), resolve("..", "..", "examples"), join(packageRoot(), "resources", "examples")]) {
    const candidate = join(root, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function writeStarterInputs(dir: string, customPipeline: boolean): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "content.json"), JSON.stringify({
    title: "TODO TV",
    description: "TODO: Describe the audience and catalog in one sentence.",
    categories: [
      { id: "featured", name: "Featured", items: ["video-1", "video-2"] },
      { id: "latest", name: "Latest", items: ["video-2", "video-3"] },
    ],
    videos: [
      starterVideo("video-1", "TODO Pilot"),
      starterVideo("video-2", "TODO Deep Dive"),
      starterVideo("video-3", "TODO Highlights"),
    ],
    featured: ["video-1"],
  }, null, 2));
  writeFileSync(join(dir, "brand.json"), JSON.stringify({
    name: "TODO TV",
    primary_color: "#f7f7f2",
    accent_color: "#f2c14e",
    background_color: "#101820",
    font_family: "Inter",
    logo_path: "",
    splash_path: "",
  }, null, 2));
  writeFileSync(join(dir, "prompt.txt"), [
    "TODO: State what the app should feel like, who it is for, and what makes it distinct.",
    "Keep the first run web-focused unless the human asks for platform builds.",
  ].join("\n"));
  if (customPipeline) {
    writeFileSync(join(dir, "harness.config.json"), JSON.stringify({
      tokenBudget: 500000,
      phases: [
        { name: "verify", verify: [{ type: "tsc" }] },
      ],
    }, null, 2));
  }
}

function starterVideo(id: string, title: string): Record<string, unknown> {
  return {
    id,
    title,
    description: "TODO: Replace this placeholder description.",
    duration_sec: 600,
    thumbnail_url: `https://placehold.co/640x360/png?text=${encodeURIComponent(title)}`,
    stream_url: "https://example.com/placeholder.m3u8",
    stream_type: "hls",
    tags: ["todo"],
  };
}

async function runHarness() {
  requireApiCredentials();
  const input = runnableHarnessInput();
  const generateOnly = args.includes("--generate-only");
  const useTui = !jsonMode && !args.includes("--no-tui") && process.stdout.isTTY;
  const { StrandsOrchestrator } = await import("./executors/strands.js");
  const { active } = selectActivePhases(input.harness.phases, {
    platforms: input.config.platforms,
    generateOnly,
  });

  if (useTui) return runStrandsTui(StrandsOrchestrator, input, active.map((phase) => phase.name), generateOnly);
  if (jsonMode) return runStrandsJson(StrandsOrchestrator, input, generateOnly);
  return runStrandsPlain(StrandsOrchestrator, input, generateOnly);
}

async function runWithClaude() {
  if (!resolveClaude()) {
    fail(
      "missing_claude_cli",
      `The "claude" CLI was not found on this machine; claude-run mode needs it.`,
      "Install Claude Code or set CLAUDE_PATH=/path/to/claude. You can also use tv-build run with ANTHROPIC_API_KEY.",
      EXIT.environment
    );
  }

  const settings: ClaudeRunSettings = {
    input: runnableHarnessInput(),
    generateOnly: args.includes("--generate-only"),
    record: !args.includes("--no-record"),
    fromPhase: valueFlag("--from-phase"),
    resumeDir: resolveRequestedResumeDir(resolve(".")),
  };
  const useTui = !jsonMode && !args.includes("--no-tui");
  if (useTui) return runClaudeTui(settings);
  if (jsonMode) return runClaudeJson(settings);
  return runClaudePlain(settings);
}

interface ClaudeRunSettings {
  input: RunnableHarnessInput;
  generateOnly: boolean;
  record: boolean;
  fromPhase?: string;
  resumeDir: string | null;
}

interface RunCompletion {
  status: "success" | "failed" | "aborted";
  lifecycle: "complete" | "failed" | "aborted";
  exitCode: number;
}

function runnableHarnessInput(): RunnableHarnessInput {
  const loaded = loadInputs();
  return {
    ...loaded,
    workdir: resolve("."),
    skillsDir: resolveSkillsDir(),
  };
}

function requireApiCredentials(): void {
  const keys = ["ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "OPENAI_API_KEY", "AWS_PROFILE", "AWS_ACCESS_KEY_ID"];
  if (keys.some((key) => Boolean(process.env[key]))) return;
  fail(
    "missing_api_credentials",
    "No API credentials found for API mode.",
    "Set one of ANTHROPIC_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY, or AWS_PROFILE; or use tv-build claude-run.",
    EXIT.environment
  );
}

async function runStrandsTui(
  Orchestrator: StrandsOrchestratorClass,
  input: RunnableHarnessInput,
  phases: Phase[],
  generateOnly: boolean
): Promise<void> {
  const { TUI } = await import("./tui.js");
  const tui = createTui(TUI, input, phases);
  const harness = new Orchestrator(input, tuiEvents(tui));
  const { state, outDir } = await harness.run({ generateOnly });
  finishTuiRun(tui, state, outDir);
}

async function runStrandsJson(
  Orchestrator: StrandsOrchestratorClass,
  input: RunnableHarnessInput,
  generateOnly: boolean
): Promise<void> {
  let harness: InstanceType<StrandsOrchestratorClass>;
  harness = new Orchestrator(input, jsonEvents(input.runId, input.workdir, () => harness.getState()));
  writeEvent("run_start", {
    mode: "run",
    platforms: input.config.platforms,
    seed: input.creativeSeed,
  });
  const { state, outDir } = await harness.run({ generateOnly });
  completeJsonRun(state, outDir);
}

async function runStrandsPlain(
  Orchestrator: StrandsOrchestratorClass,
  input: RunnableHarnessInput,
  generateOnly: boolean
): Promise<void> {
  const harness = new Orchestrator(input, plainEvents());
  console.log(`\n  TV Build — Strands SDK mode`);
  console.log(`  Platforms: ${input.config.platforms.join(", ")}`);
  const { state, outDir } = await harness.run({ generateOnly });
  console.log(`\n  Output: ${outDir}`);
  applyExitCode(runCompletion(state));
}

async function runClaudeTui(settings: ClaudeRunSettings): Promise<void> {
  const { active } = selectActivePhases(settings.input.harness.phases, {
    platforms: settings.input.config.platforms,
    generateOnly: settings.generateOnly,
  });
  const { TUI } = await import("./tui.js");
  const tui = createTui(TUI, settings.input, active.map((phase) => phase.name));
  const harness = createClaudeHarness(settings, tuiEvents(tui));
  logResume(settings, harness, (message) => tui.log(message));
  const { state, outDir } = await harness.run({
    generateOnly: settings.generateOnly,
    fromPhase: settings.fromPhase,
  });
  finishTuiRun(tui, state, outDir);
}

async function runClaudeJson(settings: ClaudeRunSettings): Promise<void> {
  let harness: ClaudeOrchestrator;
  const events = jsonEvents(settings.input.runId, settings.input.workdir, () => harness.getState());
  harness = createClaudeHarness(settings, events);
  writeEvent("run_start", {
    mode: "claude-run",
    platforms: settings.input.config.platforms,
    seed: settings.input.creativeSeed,
    resume: settings.resumeDir ?? undefined,
    fromPhase: settings.fromPhase,
  });
  logResume(settings, harness, (message) => console.error(message));
  const { state, outDir } = await harness.run({
    generateOnly: settings.generateOnly,
    fromPhase: settings.fromPhase,
  });
  completeJsonRun(state, outDir);
}

async function runClaudePlain(settings: ClaudeRunSettings): Promise<void> {
  const harness = createClaudeHarness(settings, {});
  const { input } = settings;
  console.log(`\n  TV Build (Claude CLI mode)`);
  console.log(`  Prompt: ${input.prompt.slice(0, 80)}...`);
  console.log(`  Platforms: ${input.config.platforms.join(", ")}`);
  console.log(`  Design: ${input.design.template} (tiles: ${input.design.tile_size}, spacing: ${input.design.spacing})`);
  console.log(`  Skills dir: ${input.skillsDir}`);
  logResume(settings, harness, (message) => console.log(`  ${message}`));
  console.log();
  const { state, outDir } = await harness.run({
    generateOnly: settings.generateOnly,
    fromPhase: settings.fromPhase,
  });
  console.log(`\n  Run complete.`);
  console.log(`  Output: ${outDir}`);
  console.log(`  Phases:`);
  printPhaseResults(state);
  applyExitCode(runCompletion(state));
}

function createClaudeHarness(settings: ClaudeRunSettings, events: HarnessEvents): ClaudeOrchestrator {
  return settings.resumeDir
    ? ClaudeOrchestrator.resume(settings.resumeDir, settings.input, events, { record: settings.record })
    : new ClaudeOrchestrator(settings.input, events, { record: settings.record });
}

function createTui(Tui: TuiClass, input: RunnableHarnessInput, phases: Phase[]): TUI {
  const tui = new Tui(
    input.brand.name,
    input.config.platforms,
    { template: input.design.template, navigation_style: input.design.navigation_style },
    phases
  );
  tui.start();
  return tui;
}

function tuiEvents(tui: TUI): HarnessEvents {
  return {
    onPhaseStart: (phase) => tui.setPhase(phase),
    onPhaseEnd: (phase, result, cost) => tui.phaseComplete(phase, result, cost),
    onTokens: (tokens) => tui.addTokens(tokens),
    onIteration: (phase, current, max) => tui.setIteration(phase, current, max),
    onLog: (message) => tui.log(message),
    onPhaseMessage: (phase, message) => tui.addPhaseMessage(phase, message),
  };
}

function jsonEvents(
  runId: string | undefined,
  workdir: string,
  getState: () => SessionState
): HarnessEvents {
  return {
    onPhaseStart: (phase) => {
      updateRunningStatus(runId, workdir, { state: "running", currentPhase: phase });
      writeEvent("phase_start", { phase });
    },
    onPhaseEnd: (phase, result, cost) => {
      updateRunningStatus(runId, workdir, { currentPhase: phase, costSoFar: getState().costSoFar });
      writeEvent("phase_complete", { phase, result, cost });
    },
    onTokens: (tokens) => writeEvent("tokens", { tokens }),
    onIteration: (phase, current, max) => writeEvent("iteration", { phase, current, max }),
    onLog: (message) => console.error(message),
    onPhaseMessage: (phase, message) => writeEvent("phase_message", { phase, message }),
  };
}

function plainEvents(): HarnessEvents {
  return {
    onPhaseStart: (phase) => console.log(`\n  Phase: ${phase}`),
    onPhaseEnd: (phase, result, cost) => {
      const icon = result.status === "success" ? "✓" : "✗";
      console.log(`  ${icon} ${phase}: ${result.status}${cost ? ` ($${cost.toFixed(4)})` : ""}`);
      if (result.error) console.log(`    ${result.error}`);
    },
    onLog: (message) => console.log(`  ${message}`),
  };
}

function updateRunningStatus(
  runId: string | undefined,
  workdir: string,
  patch: Parameters<typeof updateRunStatus>[1]
): void {
  if (runId) updateRunStatus(outDirForRun(workdir, runId), patch);
}

function runCompletion(state: SessionState): RunCompletion {
  const results = [...state.phaseResults.values()];
  const aborted = results.some((result) => result.status === "aborted");
  const failed = results.some((result) => result.status === "failed");
  if (aborted) return { status: "aborted", lifecycle: "aborted", exitCode: EXIT.aborted };
  if (failed) return { status: "failed", lifecycle: "failed", exitCode: EXIT.runFailure };
  return { status: "success", lifecycle: "complete", exitCode: EXIT.success };
}

function completeJsonRun(state: SessionState, outDir: string): void {
  const completion = runCompletion(state);
  updateRunStatus(outDir, {
    state: completion.lifecycle,
    exitCode: completion.exitCode,
    costSoFar: state.costSoFar,
  });
  writeEvent("run_complete", {
    runId: state.runId,
    outDir,
    seed: state.creativeSeed,
    status: completion.status,
    tokensUsed: state.tokensUsed,
    costSoFar: state.costSoFar,
    phases: [...state.phaseResults.values()],
  });
  applyExitCode(completion);
}

function finishTuiRun(tui: TUI, state: SessionState, outDir: string): void {
  const completion = runCompletion(state);
  tui.finish(completion.status === "success" ? "done" : "failed");
  tui.log(`Output: ${outDir}`);
  applyExitCode(completion);
}

function applyExitCode(completion: RunCompletion): void {
  process.exitCode = completion.exitCode;
}

function logResume(
  settings: ClaudeRunSettings,
  harness: ClaudeOrchestrator,
  log: (message: string) => void
): void {
  if (!settings.resumeDir) return;
  const scope = settings.fromPhase
    ? `redoing from: ${settings.fromPhase}`
    : `skipping: ${[...harness.getResumedPhases()].join(", ") || "none"}`;
  log(`Resuming ${settings.resumeDir} (${scope})`);
}

function printPhaseResults(state: SessionState): void {
  for (const [phase, result] of state.phaseResults) {
    const icon = result.status === "success" ? "✓" : result.status === "degraded" ? "~" : "✗";
    console.log(`    ${icon} ${phase}: ${result.status} (${result.iterations} iterations)`);
  }
}

async function runRefineCommand() {
  const options = refineOptions();
  const plan = refinePlan(options);
  if (args.includes("--plan")) return printRefinePlan(plan);
  requireInferredPhaseConfirmation(plan);
  const result = await executeRefineCommand(options);
  printRefineResult(result);
  applyRefineExitCode(result);
}

function refineOptions(): RefineOptions {
  const target = positionalArgs()[0];
  const instruction = positionalArgs().slice(1).join(" ").trim();
  if (!target || !instruction) {
    fail("missing_refine_args", "Missing refine target or instruction.", "Run tv-build refine <runId|appDir> --phase branding \"warmer hero\" --plan.", EXIT.input);
  }
  return {
    target,
    instruction,
    phase: phaseFlag(),
    rootDir: resolve("."),
    skillsDir: resolveSkillsDir(),
    json: jsonMode,
    yes: args.includes("--yes"),
  };
}

function refinePlan(options: RefineOptions): RefinePlan {
  try {
    return buildRefinePlan(options);
  } catch (err) {
    throwRefineInputError(err);
  }
}

function printRefinePlan(plan: RefinePlan): void {
  if (jsonMode) {
    writeJson({ ...plan });
    return;
  }
  console.log("\n  Refine plan\n");
  console.log(`  Run: ${plan.runId}`);
  console.log(`  App: ${plan.appDir}`);
  console.log(`  Phase: ${plan.phase}${plan.inferredPhase ? " (inferred)" : ""}`);
  console.log(`  Seed: ${plan.seed}`);
  console.log(`  Verify checks: ${plan.verify.length || "none"}`);
  console.log(`  Instruction: ${plan.instruction}`);
  console.log(`  Non-goal: ${plan.nonGoal}`);
  console.log();
}

function requireInferredPhaseConfirmation(plan: RefinePlan): void {
  if (plan.inferredPhase && !args.includes("--yes")) {
    fail(
      "phase_confirmation_required",
      `Refine inferred phase "${plan.phase}".`,
      `Rerun with --phase ${plan.phase}, or show the plan and pass --yes to confirm the inferred phase.`,
      EXIT.input
    );
  }
}

async function executeRefineCommand(options: RefineOptions): Promise<RefineResult> {
  try {
    return await executeRefine(options);
  } catch (err) {
    throwRefineInputError(err);
  }
}

function printRefineResult(result: RefineResult): void {
  if (!jsonMode) {
    console.log(`\n  Refine ${result.status}: ${result.phase}`);
    console.log(`  Output: ${result.outDir}`);
    console.log(`  Cost: $${result.costUsd.toFixed(4)}`);
    if (result.error) console.log(`  Error: ${result.error}`);
  }
}

function applyRefineExitCode(result: RefineResult): void {
  if (result.status === "aborted") process.exitCode = EXIT.aborted;
  else if (result.status === "failed") process.exitCode = EXIT.runFailure;
}

function throwRefineInputError(err: unknown): never {
  if (err instanceof RefineInputError) fail(err.code, err.message, err.hint, EXIT.input);
  throw err;
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
  const candidates = [resolve("../../skills"), resolve("skills"), resolve("../skills"), join(packageRoot(), "resources", "skills")];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return resolve("../../skills");
}

function packageRoot(): string {
  const moduleDir = typeof import.meta.dirname === "string" ? import.meta.dirname : dirname(fileURLToPath(import.meta.url));
  return resolve(moduleDir, "..");
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
  if (jsonMode) {
    const required = results.filter((r) => !r.optional);
    const failures = required.filter((r) => !r.ok);
    writeJson({
      command: "doctor",
      ok: failures.length === 0,
      results,
      error: failures.length > 0
        ? { code: "doctor_failed", message: `${failures.length} required check(s) failed.`, hint: "Run tv-build doctor --fix." }
        : undefined,
    });
    if (failures.length > 0) process.exitCode = EXIT.environment;
    return;
  }
  printDoctorReport(results, args.includes("--fix"));
}

async function runVegaDoctorCommand() {
  const appDir = args.some((arg) => arg.startsWith("--app=")) ? findAppDir() : undefined;
  const results = await runDoctor({ vega: true, appDir });
  if (jsonMode) {
    const required = results.filter((r) => !r.optional);
    const failures = required.filter((r) => !r.ok);
    writeJson({
      command: "vega-doctor",
      ok: failures.length === 0,
      results,
      error: failures.length > 0
        ? { code: "doctor_failed", message: `${failures.length} required check(s) failed.`, hint: "Run tv-build vega-doctor --fix." }
        : undefined,
    });
    if (failures.length > 0) process.exitCode = EXIT.environment;
    return;
  }
  printDoctorReport(results, args.includes("--fix"));
}

async function runReplay() {
  const recordingPath = resolveReplayRecording(positionalArgs()[0]);
  if (!existsSync(recordingPath)) {
    fail(
      "recording_not_found",
      `Recording not found: ${recordingPath}`,
      "Pass a recording path or a fixture name under docs/course/fixtures.",
      EXIT.input
    );
  }

  const speed = replaySpeed();
  const client = new ReplayClient(recordingPath, { speed });
  const summary = client.totals;
  const useTui = !jsonMode && !args.includes("--no-tui") && process.stdout.isTTY;

  if (jsonMode) {
    writeEvent("run_start", {
      mode: "replay",
      recording: recordingPath,
      turns: client.total,
      seed: client.seed,
    });
    await replayTurns(client, {
      onPhaseStart: (phase) => writeEvent("phase_start", { phase }),
      onPhaseMessage: (phase, message) => writeEvent("phase_message", { phase, message }),
      onUsage: (phase, tokens, cost, phaseCost) => writeEvent("tokens", { phase, tokens, cost, phaseCost }),
      onPhaseEnd: (phase, result) => writeEvent("phase_complete", { phase, result }),
    });
    writeEvent("run_complete", {
      mode: "replay",
      recording: recordingPath,
      seed: client.seed,
      status: "success",
      turns: client.total,
      tokens: summary.tokens,
      cost: summary.costUsd,
    });
    return;
  } else if (useTui) {
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
    if (client.seed) console.log(`  Creative seed: ${client.seed}\n`);
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
    join(packageRoot(), "resources", "fixtures", arg, "recording.json"),
  ];
  return fixtureCandidates.find((candidate) => existsSync(candidate)) ?? fixtureCandidates[0];
}

function printRunStatus(): void {
  const runId = positionalArgs()[0];
  if (!runId) {
    fail("missing_run_id", "Missing run id for status.", "Run tv-build status <runId>.", EXIT.input);
  }
  const summary = summarizeRun(resolve("."), runId);
  if (!summary) {
    fail("run_not_found", `Run "${runId}" not found.`, "Check the run id under ./out/.", EXIT.input);
  }
  if (jsonMode) {
    writeJson({ command: "status", ...summary });
    if (summary.state === "failed") process.exitCode = EXIT.runFailure;
    if (summary.state === "aborted") process.exitCode = EXIT.aborted;
    return;
  }
  console.log(`Run: ${summary.runId}`);
  console.log(`State: ${summary.state}${summary.stalePid ? " (stale pid)" : ""}`);
  if (summary.pid) console.log(`PID: ${summary.pid}`);
  if (summary.currentPhase) console.log(`Current phase: ${summary.currentPhase}`);
  console.log(`Completed phases: ${summary.phasesComplete.join(", ") || "none"}`);
  if (summary.costSoFar !== undefined) console.log(`Cost: $${summary.costSoFar.toFixed(4)}`);
  console.log(`Output: ${summary.outDir}`);
  if (summary.lastLogLines.length) {
    console.log("\nLast log lines:");
    for (const line of summary.lastLogLines) console.log(line);
  }
  if (summary.state === "failed") process.exitCode = EXIT.runFailure;
  if (summary.state === "aborted") process.exitCode = EXIT.aborted;
}

async function printRunLogs(): Promise<void> {
  const runId = positionalArgs()[0];
  if (!runId) {
    fail("missing_run_id", "Missing run id for logs.", "Run tv-build logs <runId>.", EXIT.input);
  }
  const outDir = outDirForRun(resolve("."), runId);
  const logPath = join(outDir, "run.log");
  if (!existsSync(logPath)) {
    fail("log_not_found", `No run.log found for run "${runId}".`, "Check the run id under ./out/.", EXIT.input);
  }

  const printNew = (() => {
    let offset = 0;
    return () => {
      const content = readFileSync(logPath, "utf-8");
      const next = content.slice(offset);
      offset = content.length;
      if (next) process.stdout.write(next);
    };
  })();

  printNew();
  if (!args.includes("--follow")) return;
  await new Promise<void>((resolvePromise) => {
    const timer = setInterval(printNew, 1000);
    process.on("SIGINT", () => {
      clearInterval(timer);
      resolvePromise();
    });
  });
}

function abortDetachedRun(): void {
  const runId = positionalArgs()[0];
  if (!runId) {
    fail("missing_run_id", "Missing run id for abort.", "Run tv-build abort <runId>.", EXIT.input);
  }
  const summary = abortRun(resolve("."), runId);
  if (!summary) {
    fail("run_not_found", `Run "${runId}" not found.`, "Check the run id under ./out/.", EXIT.input);
  }
  if (jsonMode) {
    writeJson({ command: "abort", ...summary });
    return;
  }
  console.log(`Aborted run ${runId}`);
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
  const autoSkills = lib.listSkills("auto");

  if (autoSkills.length === 0) {
    console.log("\n  No auto-skills found in skills/auto/\n");
    return;
  }

  console.log("\n  Auto-Skill Review\n");
  console.log("  Name                          Applies to");
  console.log("  " + "─".repeat(65));

  for (const skill of autoSkills) {
    console.log(`  ${skill.name.padEnd(30)} ${skill.applies_to.join(", ") || "(none)"}`);
  }

  console.log("\n  Effectiveness ranking is unavailable until recurrence tracking is implemented.");
  console.log("  Review candidates manually before deleting or promoting them.");
  if (process.argv.includes("--auto")) {
    console.log("  --auto is disabled because there is no reliable effectiveness signal.");
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
    const parent = resolve(dir, "..");
    if (existsSync(join(parent, "spec.json"))) return parent;
  }

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
    refine <target> "..."  Amend one phase concern on the current app state
    review [scope]         Review the generated app code for TV-specific issues
    doctor                 Check prerequisites
    vega-doctor            Check Vega SDK, VDA, manifest, and Amazon Devices Builder Tools
    replay <file|fixture>  Replay a recorded run
    status <runId>         Read detached run state
    logs <runId>           Print detached run logs (--follow to tail)
    abort <runId>          Stop a detached run
    schema [name]          List input schemas or print one schema
    validate [dir]         Validate inputs and semantic warnings
    init <dir>             Scaffold an input directory
    templates check        Compare pinned template SHAs with upstream HEAD
    android <runId|app>    Build, install, launch, test, and capture an Android TV app

  Options:
    --example <name>       Use a bundled example (e.g. cooking-shows)
    --generate-only        Skip simulator build phases
    --resume [runId]       Resume a previous run from its checkpoint (latest if no runId)
    --from-phase <name>    Skip phases before <name> (use with --resume to rerun a phase)
    --phase <name>         With refine: target a phase concern such as branding or creative_ui
    --config <path>        Use a harness.config.json (custom template/phases/skills/models)
    --plan                 Print the resolved active PhaseSpec[] and exit
    --detach               Start run/claude-run/refine in the background
    --yes                  Required with --detach --json/refine --json after showing the plan to a human
    --json                 Emit machine-readable JSON/NDJSON with schemaVersion=1
    --no-tui               Plain console output instead of the TUI
    --no-record            Disable recording.json creation in claude-run mode
    --speed <x>            With replay: divide stored turn delays by this multiplier
    --seed <value>         Fix the creative seed for repeatable creative constraints
    --from-example <name>  With init: copy a bundled example as the starting point
    --force                With init: allow overwriting files in a non-empty directory
    --custom-pipeline      With init: include a starter harness.config.json
    --app=<path>           Specify app directory for add-screen/review/test-ui
    --close                Close browser after test-ui completes (default: stay open)
    --fix                  With doctor: print exact fix commands for failing checks
    --device <serial>      Select an Android device for the android command
    --flow <path>          Run an asserted Android D-pad flow JSON file
    --setup-agent         Install/update the Android CLI agent skill with android init
    --require-android-cli Fail instead of using the Gradle/ADB compatibility path
    --start-emulator <id> Start an emulator with Android CLI before Android lifecycle steps

  Exit codes:
    0 success
    1 input or validation error
    2 run failure after retries
    3 environment or doctor error
    4 aborted

  Refine semantics:
    refine amends the current generated app state. It does not rewind to the
    original phase commit or replay downstream phases. For rewind behavior,
    edit versioned inputs and run the pipeline again with a pinned --seed.

  Customizing (harness.config.json — in your input dir or passed via --config):
    {
      "template": {
        "repo": "https://github.com/you/your-tv-template.git",
        "commit": "0123456789abcdef0123456789abcdef01234567"
      },
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
    npx tv-build claude-run --example cooking-shows --detach --yes --json
    npx tv-build status d811afcb --json
    npx tv-build claude-run --resume d811afcb --from-phase navigation
    npx tv-build test-ui
    npx tv-build test-ui --app=./my-app --close
    npx tv-build visual-qa
    npx tv-build vega-doctor --fix
    npx tv-build visual-qa --app=out/d811afcb
    npx tv-build schema content --json
    npx tv-build init ./my-app-inputs
    npx tv-build validate ./my-app-inputs --json
    npx tv-build templates check --json
    npx tv-build android d811afcb --plan --json
    npx tv-build android d811afcb --setup-agent --yes --json
    npx tv-build android d811afcb --build --install --launch --test --yes --json
    npx tv-build refine d811afcb --phase branding "warmer palette, larger hero cards" --plan
    npx tv-build refine d811afcb --phase branding "warmer palette, larger hero cards" --yes
    npx tv-build add-screen Watchlist --type=grid
    npx tv-build add-screen Home --type=hero+rails
    npx tv-build review
    npx tv-build review "focus navigation"
    npx tv-build run ./my-app-inputs
`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  if (jsonMode) {
    writeError("fatal_error", message, "Rerun with --help or check out/<runId>/run.log if a run directory was created.");
  } else {
    console.error("Fatal error:", message);
  }
  process.exit(EXIT.runFailure);
});
