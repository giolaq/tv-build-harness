#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditSource, summarize } from "./portability-audit.js";
import { ADBT_PORT_WORKFLOWS, AdbtMcpContextProvider, AdbtContextError, AdbtReplayContextProvider } from "./context-providers/adbt.js";
import { BeeContextProvider } from "./context-providers/bee.js";
import { CliFailure, failure, json } from "./output.js";
import { applyProposal, loadMemory, loadSnapshot, propose } from "./project-memory.js";
import { assembleProjectContext } from "./phase-context.js";
import { createPortExecutor, resolveExecutorConfig } from "./port-executor.js";
import { PortBudgetError, runPortPipeline } from "./port-pipeline.js";
import { ADBT_PACKAGE, VEGA_SDK_VERSION, VegaAdapter, VegaReplayAdapter, runVegaLifecycle, type VegaCapability } from "./platform/vega.js";
import { copySource, discoverSource } from "./source-app.js";
import { workshopDoctor } from "./workshop-doctor.js";

const args = process.argv.slice(2);
const command = args[0];
const root = resolve(process.env.WORKSHOP_OUT ?? "out");

async function main(): Promise<void> {
  if (command === "doctor") return doctor();
  if (command === "plan") return planCommand();
  if (command === "run") return runCommand();
  if (command === "status") return statusCommand();
  if (command === "logs") return logsCommand();
  if (command === "memory") return memoryCommand();
  if (command === "context") return contextCommand();
  if (command === "vega-run") return vegaRunCommand();
  help();
}

async function doctor(): Promise<void> {
  const checks = await workshopDoctor();
  json({ command: "doctor", state: checks.some((c) => c.status === "repair") ? "repairable" : "ready", checks });
  if (checks.some((c) => c.status === "repair")) process.exitCode = 3;
}

function buildPlan(sourcePath: string) {
  const source = discoverSource(sourcePath);
  const findings = auditSource(source);
  const inputDir = flag("--inputs");
  const memory = loadMemory(inputDir ?? sourcePath);
  const phaseContext = assembleProjectContext(memory, "vega_port");
  const executor = resolveExecutorConfig({ executor: flag("--executor"), provider: flag("--provider"), model: flag("--model"), region: flag("--region") });
  return {
    source,
    target: { platform: "firetv-vega", sdk: VEGA_SDK_VERSION },
    seed: flag("--seed") ?? "workshop-v1",
    maxCostUsd: Number(flag("--max-cost") ?? 10),
    executor,
    summary: summarize(findings),
    findings,
    contextEntryIds: phaseContext.entryIds,
    phaseContext: phaseContext.text,
    adbt: { package: ADBT_PACKAGE, mode: !flag("--replay") || args.includes("--adbt-live") ? "live" : "replay", phase: "vega_port", workflows: ADBT_PORT_WORKFLOWS },
    phases: ["source_discovery", "vega_portability_audit", "tv_product_spec", "vega_port", "tv_behavior", "production_vega_run"],
  };
}

function planCommand(): void {
  const sourcePath = args[1];
  if (!sourcePath) failure("missing_source", "A source app path is required.", "Run workshop-harness plan <app> --inputs <dir> --json.");
  try { json({ command: "plan", plan: buildPlan(sourcePath) }); }
  catch (error) { failure("invalid_source", String(error), "Provide a React Native project containing package.json."); }
}

async function runCommand(): Promise<void> {
  const sourcePath = args[1];
  if (!sourcePath) failure("missing_source", "A source app path is required.", "Run workshop-harness run <app> --inputs <dir> --yes --json.");
  if (!args.includes("--yes")) failure("confirmation_required", "Run requires explicit confirmation.", "Show the plan, then rerun with --yes.");
  if (args.includes("--detach") && !args.includes("--child")) return detach(sourcePath);
  await executeRun(sourcePath, flag("--run-id") ?? randomUUID().slice(0, 8));
}

function detach(sourcePath: string): void {
  const runId = randomUUID().slice(0, 8);
  const out = join(root, runId);
  mkdirSync(out, { recursive: true });
  const log = join(out, "run.log");
  const fd = BunFreeOpen(log);
  const forwarded = args.concat(["--child", "--run-id", runId]).filter((arg) => arg !== "--detach");
  const childArgs = ["--import", "tsx", fileURLToPath(import.meta.url), ...forwarded];
  const child = spawn(process.execPath, childArgs, { detached: true, stdio: ["ignore", fd, fd] });
  child.unref();
  writeFileSync(join(out, "pid"), String(child.pid));
  writeFileSync(join(out, "status.json"), JSON.stringify({ schemaVersion: 1, runId, state: "running", currentPhase: "source_discovery" }, null, 2));
  json({ command: "detach", runId, pid: child.pid, out });
}

async function executeRun(sourcePath: string, runId: string): Promise<void> {
  const out = join(root, runId);
  mkdirSync(out, { recursive: true });
  const statusPath = join(out, "status.json");
  try {
    const plan = buildPlan(sourcePath);
    writeFileSync(statusPath, JSON.stringify({ schemaVersion: 1, runId, state: "running", currentPhase: "source_discovery", phasesComplete: [] }, null, 2));
    const appDir = join(out, "app");
    copySource(sourcePath, appDir);
    const inputs = flag("--inputs");
    if (inputs && existsSync(resolve(inputs))) cpSync(resolve(inputs), join(out, "inputs"), { recursive: true });
    writeFileSync(join(out, "portability-report.json"), JSON.stringify({ schemaVersion: 1, ...plan }, null, 2));
    writeFileSync(join(out, "tv-build-inputs.json"), JSON.stringify({ schemaVersion: 1, sourceApp: join(out, "app"), target: "firetv-vega", seed: plan.seed, maxCostUsd: plan.maxCostUsd }, null, 2));
    const replayPath = flag("--replay");
    const executor = createPortExecutor({ appDir, outDir: out, replayPath, config: plan.executor });
    const adbtReplay = args.includes("--adbt-live") ? undefined : flag("--adbt-replay") ?? (replayPath ? join(dirname(resolve(replayPath)), "adbt-port-context.json") : undefined);
    const adbt = adbtReplay ? new AdbtReplayContextProvider(resolve(adbtReplay)) : new AdbtMcpContextProvider({ cwd: appDir });
    const port = await runPortPipeline({ appDir, outDir: out, findings: plan.findings, projectContext: plan.phaseContext, seed: plan.seed, maxCostUsd: plan.maxCostUsd, executor, adbt, onPhase: (currentPhase) => writeFileSync(statusPath, JSON.stringify({ schemaVersion: 1, runId, state: "running", currentPhase, phasesComplete: ["source_discovery", "vega_portability_audit"] }, null, 2)) });
    writeFileSync(join(out, "port-result.json"), JSON.stringify({ schemaVersion: 1, ...port }, null, 2));
    const executionMode = replayPath ? "Replay (recorded model turns)" : plan.executor.kind === "strands" ? `Strands (${plan.executor.model.provider}:${plan.executor.model.modelId})` : `Claude Code (${plan.executor.model})`;
    const report = `# Workshop Run ${runId}\n\n- Target: Vega SDK ${VEGA_SDK_VERSION}\n- ADBT package: ${ADBT_PACKAGE}\n- ADBT port context: ${port.adbt?.mode ?? "missing"} (${port.adbt?.documents.join(", ") ?? "none"})\n- ADBT evidence: ${port.adbt?.evidence ?? "none"}\n- Executor: ${executionMode}\n- Seed: ${plan.seed}\n- Cost cap: $${plan.maxCostUsd}\n- Port cost: $${port.costUsd.toFixed(4)}\n- Source copied: yes\n- Port phases: ${port.phases.map((phase) => `${phase.name} (${phase.attempts} attempt${phase.attempts === 1 ? "" : "s"})`).join(", ")}\n- Next: inspect the generated app, then run vega-run for build and device evidence.\n`;
    writeFileSync(join(out, "report.md"), report);
    const phasesComplete = ["source_discovery", "vega_portability_audit", ...port.phases.map((phase) => phase.name)];
    writeFileSync(statusPath, JSON.stringify({ schemaVersion: 1, runId, state: "complete", currentPhase: null, phasesComplete, costUsd: port.costUsd, out }, null, 2));
    json({ event: "run_complete", runId, state: "complete", out, seed: plan.seed, costUsd: port.costUsd, phasesComplete });
  } catch (error) {
    const budget = error instanceof PortBudgetError;
    const adbtFailure = error instanceof AdbtContextError;
    writeFileSync(statusPath, JSON.stringify({ schemaVersion: 1, runId, state: budget ? "aborted" : "failed", reason: budget ? "budget" : undefined, error: String(error) }, null, 2));
    failure(budget ? "budget_exceeded" : adbtFailure ? "adbt_unavailable" : "run_failed", String(error), adbtFailure ? "Run doctor once or use the recorded ADBT replay context." : `Inspect ${out}/run.log and portability-report.json.`, budget ? 4 : adbtFailure ? 3 : 2);
  }
}

function statusCommand(): void {
  const runId = args[1];
  const path = runId && join(root, runId, "status.json");
  if (!path || !existsSync(path)) failure("run_not_found", `Run ${runId ?? ""} was not found.`, "Use the runId returned by run --detach.");
  process.stdout.write(`${readFileSync(path, "utf8").trim()}\n`);
}

function logsCommand(): void {
  const path = join(root, args[1] ?? "", "run.log");
  if (!existsSync(path)) failure("log_not_found", "Run log was not found.", "Check status with the runId first.");
  process.stdout.write(readFileSync(path, "utf8"));
}

function memoryCommand(): void {
  const action = args[1];
  const dir = args[2];
  if (!dir) failure("missing_memory_dir", "Memory directory is required.", "Run memory show <inputs>.");
  if (action === "show") return json({ command: "memory_show", memory: loadMemory(dir) });
  const from = flag("--from");
  if (action === "propose" && from) return json({ command: "memory_propose", proposal: propose(loadSnapshot(from)) });
  if (action === "apply" && from && args.includes("--yes")) return json({ command: "memory_apply", memory: applyProposal(dir, propose(loadSnapshot(from))) });
  failure("invalid_memory_command", "Memory command is incomplete.", "Use show, propose --from, or apply --from --yes.");
}

async function contextCommand(): Promise<void> {
  if (args[1] === "adbt" && args[2] === "port") {
    const replay = flag("--adbt-replay");
    const provider = replay ? new AdbtReplayContextProvider(resolve(replay)) : new AdbtMcpContextProvider({ cwd: root });
    return json({ command: "context_adbt_port", context: await provider.load() });
  }
  if (args[1] !== "bee") failure("unknown_provider", "Use the ADBT port context or optional Bee provider.", "Use context adbt port, context bee search, or context bee snapshot.");
  const provider = new BeeContextProvider();
  if (args[2] === "search") return json({ command: "context_search", candidates: await provider.search(args[3] ?? "") });
  if (args[2] === "snapshot") {
    const out = flag("--out");
    if (!out) failure("missing_output", "Snapshot output path is required.", "Add --out candidate-context.json.");
    const ids = args.slice(3, args.indexOf("--out"));
    const snapshot = await provider.snapshot(ids, flag("--query") ?? "workshop product context");
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(resolve(out), JSON.stringify(snapshot, null, 2));
    return json({ command: "context_snapshot", out: resolve(out), snapshot });
  }
  failure("invalid_context_command", "Context command is incomplete.", "Use context bee search <query> or snapshot <ids> --out <file>.");
}

async function vegaRunCommand(): Promise<void> {
  const runId = args[1];
  const out = runId && join(root, runId);
  const appDir = out && join(out, "app");
  const vegaDir = appDir && join(appDir, "apps", "vega");
  if (!vegaDir || !existsSync(join(vegaDir, "package.json"))) failure("vega_app_missing", "The guarded run has no apps/vega package.", "Run the verified port pipeline before Vega execution.");
  const liveAdapter = new VegaAdapter(process.env.VEGA_BIN ?? "vega", vegaDir);
  const capabilities: Array<{ capability: VegaCapability; values?: string[] }> = [
    { capability: "sdk_version" }, { capability: "device_status" }, { capability: "build" },
    { capability: "install", values: ["<build/*.vpkg>"] }, { capability: "launch", values: ["<component-id>"] },
    { capability: "logs" }, { capability: "capture", values: ["/tmp/tv-build-launch.png"] },
    { capability: "pull", values: ["/tmp/tv-build-launch.png", "<run>/01-launch.png"] },
  ];
  if (args.includes("--plan")) return json({ command: "vega_run_plan", runId, appDir, sdkVersion: VEGA_SDK_VERSION, adbtPackage: ADBT_PACKAGE, steps: capabilities.map((step) => ({ capability: step.capability, command: liveAdapter.command(step.capability, ...(step.values ?? [])) })), requiresConfirmation: true });
  if (!args.includes("--yes")) failure("confirmation_required", "Vega execution requires explicit confirmation.", "Show vega-run --plan, then rerun with --yes.");
  const replayPath = flag("--platform-replay");
  const replay = replayPath ? JSON.parse(readFileSync(resolve(replayPath), "utf8")) as { packagePath: string; appId: string; turns: Array<{ capability: VegaCapability; result: { code: number; stdout: string; stderr: string; timedOut: boolean } }> } : null;
  const platformResult = await runVegaLifecycle({
    adapter: replay ? new VegaReplayAdapter(replay.turns) : liveAdapter,
    appDir: vegaDir,
    focusDir: appDir,
    outDir: out,
    evidenceMode: replay ? "replay" : "live",
    packagePath: replay?.packagePath,
    appId: replay?.appId,
  });
  const state = platformResult.blockers.length === 0 ? "complete" : "failed";
  json({ event: "run_complete", runId, state, platformResult });
  if (state === "failed") process.exitCode = 2;
}

function flag(name: string): string | undefined { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }
function BunFreeOpen(path: string): number { mkdirSync(dirname(path), { recursive: true }); return openSync(path, "a"); }
function help(): void { process.stdout.write("Workshop Harness\n\nCommands: doctor, plan, run, status, logs, memory, context adbt, context bee, vega-run\n\nModel execution:\n  --executor claude-cli                 Local Claude Code (default)\n  --executor strands --provider <name>  Remote model through Strands\n  --model <id> [--region <aws-region>]  Provider model settings\n  --replay <recording.json>             No-model workshop path\n  --adbt-replay <context.json>          Recorded ADBT context (otherwise inferred beside replay)\n  --adbt-live                           Call pinned ADBT even when model output uses replay\n\nLive ports call pinned ADBT workflows at runtime before vega_port.\nStrands providers: bedrock, openai, openrouter\n"); }

main().catch((error) => { if (!(error instanceof CliFailure)) failure("unexpected_error", error instanceof Error ? error.message : String(error), "Read the workshop troubleshooting guide.", 3); });
