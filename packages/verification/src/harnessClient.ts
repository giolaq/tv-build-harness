import { execSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { PinnedEnv, RunOutcome, SeedPolicy } from "@tv-build/shared-types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const HARNESS_DIR = join(REPO_ROOT, "packages/harness");
const HARNESS_TIMEOUT_MS = 1_800_000;

export interface HarnessPhaseTiming {
  phase: string;
  durationS: number;
}

export interface HarnessResult {
  runId: string;
  appPath: string;
  costUsd: number;
  latencyS: number;
  specPath: string;
  reportPath: string;
  logPath: string;
  seed?: string;
  phaseTimings: HarnessPhaseTiming[];
  env: PinnedEnv;
}

interface HarnessRunOptions {
  command?: string;
  extraArgs?: string[];
  seed?: string;
  seedPolicy?: SeedPolicy;
  fixedSeed?: string;
  judge?: { model: string; promptHash: string };
}

interface HarnessEvent {
  schemaVersion: number;
  event?: string;
  phase?: string;
  runId?: string;
  outDir?: string;
  seed?: string;
  status?: string;
  costSoFar?: number;
  cost?: number;
  result?: { phase?: string; status?: string };
}

export class HarnessRunError extends Error {
  constructor(
    message: string,
    public outcome: RunOutcome,
    public details: {
      exitCode?: number | null;
      signal?: NodeJS.Signals | null;
      stdout?: string;
      stderr?: string;
      runId?: string;
      costUsd?: number;
      seed?: string;
    } = {},
  ) {
    super(message);
    this.name = "HarnessRunError";
  }
}

export async function runHarness(
  inputDir: string,
  options: HarnessRunOptions = {},
): Promise<HarnessResult> {
  const command = options.command ?? `npx tsx ${join(HARNESS_DIR, "src/index.ts")} claude-run`;
  const { cmd, args: baseArgs } = splitCommand(command);
  const resolvedInput = resolve(inputDir);
  const args = [
    ...baseArgs,
    "--json",
    "--no-tui",
    "--generate-only",
    ...(options.seed ? ["--seed", options.seed] : []),
    ...(options.extraArgs ?? []),
    resolvedInput,
  ];

  const startTime = Date.now();
  const parsed = createHarnessEventParser();
  const { stdout, stderr, code, signal } = await runProcess(cmd, args, HARNESS_DIR, parsed.onStdoutLine);
  const endTime = Date.now();

  if (code !== 0) {
    const outcome = classifyHarnessExit(code, signal, stderr || stdout);
    throw new HarnessRunError(
      stderr || stdout || `Harness exited with code ${code ?? "null"}${signal ? ` signal ${signal}` : ""}`,
      outcome,
      {
        exitCode: code,
        signal,
        stdout,
        stderr,
        runId: parsed.runId,
        costUsd: parsed.costUsd,
        seed: parsed.seed,
      },
    );
  }

  if (!parsed.runId) {
    throw new HarnessRunError(
      "Harness JSON stream did not include a run_complete runId.",
      "infra_error",
      { stdout, stderr, costUsd: parsed.costUsd, seed: parsed.seed },
    );
  }

  const outDir = parsed.outDir ?? join(HARNESS_DIR, "out", parsed.runId);

  return {
    runId: parsed.runId,
    appPath: join(outDir, "app"),
    costUsd: parsed.costUsd,
    latencyS: parsed.latencyS ?? ((endTime - startTime) / 1000),
    specPath: resolvedInput,
    reportPath: join(outDir, "report.md"),
    logPath: join(outDir, "run.log"),
    seed: parsed.seed,
    phaseTimings: parsed.phaseTimings,
    env: captureEnv({
      seedPolicy: options.seedPolicy,
      fixedSeed: options.fixedSeed,
      judge: options.judge,
    }),
  };
}

export function classifyHarnessExit(
  code: number | null,
  signal: NodeJS.Signals | null,
  output: string,
): RunOutcome {
  if (code === 2) return "harness_failure";
  if (code === 3) return "infra_error";
  if (code === 4) return "infra_error";
  if (code === null) {
    const fallback = classifyExitlessFailure(output);
    console.warn(`Harness exited without code${signal ? ` (${signal})` : ""}; using text fallback: ${fallback}`);
    return fallback;
  }
  return "infra_error";
}

export interface CaptureEnvOptions {
  seedPolicy?: SeedPolicy;
  fixedSeed?: string;
  judge?: { model: string; promptHash: string };
}

export function captureEnv(options: CaptureEnvOptions = {}): PinnedEnv {
  const nodeVersion = process.version;

  let claudeCliVersion = "unknown";
  try {
    claudeCliVersion = execSync("claude --version", { encoding: "utf-8", timeout: 500 }).trim();
  } catch {}

  let harnessCommit = "unknown";
  try {
    harnessCommit = execSync("git rev-parse --short HEAD", {
      cwd: REPO_ROOT,
      encoding: "utf-8",
    }).trim();
  } catch {}

  return {
    modelPlan: "unknown",
    modelExecution: "unknown",
    templateRepo: "unknown",
    templateCommits: captureTemplateCommits(),
    seedPolicy: options.seedPolicy,
    fixedSeed: options.fixedSeed,
    judge: options.judge,
    nodeVersion,
    claudeCliVersion,
    harnessCommit,
    timestamp: new Date().toISOString(),
  };
}

function captureTemplateCommits(): Record<string, string> {
  try {
    const source = readFileSync(join(HARNESS_DIR, "src", "harness-config.ts"), "utf-8");
    const repo = source.match(/repo:\s*"([^"]+)"/)?.[1];
    const commit = source.match(/commit:\s*"([0-9a-f]{40})"/)?.[1];
    const commits: Record<string, string> = {};
    if (repo && commit) commits[repo] = commit;
    return commits;
  } catch {
    return {};
  }
}

function runProcess(
  cmd: string,
  args: string[],
  cwd: string,
  onStdoutLine: (line: string) => void,
): Promise<{ stdout: string; stderr: string; code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let stdoutBuffer = "";
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      killProcessGroup(child.pid);
      reject(error);
    };

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      stdoutBuffer += text;
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) {
          try {
            onStdoutLine(line);
          } catch (error) {
            fail(error);
            return;
          }
        }
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    timeout = setTimeout(() => {
      fail(new HarnessRunError("Harness timed out after 30 minutes", "infra_error", { stdout, stderr }));
    }, HARNESS_TIMEOUT_MS);

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (stdoutBuffer.trim()) {
        try {
          onStdoutLine(stdoutBuffer);
        } catch (error) {
          reject(error);
          return;
        }
      }
      resolveProcess({ stdout, stderr, code, signal });
    });
    child.on("error", (error) => {
      fail(error);
    });
  });
}

function createHarnessEventParser(): {
  onStdoutLine: (line: string) => void;
  runId?: string;
  outDir?: string;
  seed?: string;
  costUsd: number;
  latencyS?: number;
  phaseTimings: HarnessPhaseTiming[];
} {
  const phaseStarts = new Map<string, number>();
  const phaseTimings: HarnessPhaseTiming[] = [];
  let firstEventAt: number | undefined;
  let lastEventAt: number | undefined;
  const state = {
    costUsd: 0,
    phaseTimings,
  } as {
    runId?: string;
    outDir?: string;
    seed?: string;
    costUsd: number;
    latencyS?: number;
    phaseTimings: HarnessPhaseTiming[];
    onStdoutLine: (line: string) => void;
  };

  state.onStdoutLine = (line: string) => {
    const event = parseHarnessEvent(line);
    const now = Date.now();
    firstEventAt ??= now;
    lastEventAt = now;

    if (event.event === "run_start" && event.seed) state.seed = event.seed;
    if (event.event === "phase_start" && event.phase) phaseStarts.set(event.phase, now);
    if (event.event === "phase_complete" && event.phase) {
      const start = phaseStarts.get(event.phase);
      if (start) phaseTimings.push({ phase: event.phase, durationS: (now - start) / 1000 });
      if (typeof event.cost === "number") state.costUsd += event.cost;
    }
    if (event.event === "run_complete") {
      if (event.runId) state.runId = event.runId;
      if (event.outDir) state.outDir = event.outDir;
      if (event.seed) state.seed = event.seed;
      if (typeof event.costSoFar === "number") state.costUsd = event.costSoFar;
      if (firstEventAt && lastEventAt) state.latencyS = (lastEventAt - firstEventAt) / 1000;
    }
  };

  return state;
}

function parseHarnessEvent(line: string): HarnessEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new HarnessRunError(`Harness stdout was not valid NDJSON: ${line.slice(0, 120)}`, "infra_error");
  }
  const event = parsed as { schemaVersion?: unknown };
  if (event.schemaVersion !== 1) {
    throw new HarnessRunError(
      `Unsupported harness JSON schemaVersion: ${String(event.schemaVersion)}`,
      "infra_error",
    );
  }
  return parsed as HarnessEvent;
}

function splitCommand(command: string): { cmd: string; args: string[] } {
  const tokens = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((token) =>
    token.replace(/^["']|["']$/g, "")
  ) ?? [];
  if (tokens.length === 0) {
    throw new Error("harnessCommand is empty");
  }
  return { cmd: tokens[0], args: tokens.slice(1) };
}

function killProcessGroup(pid: number | undefined): void {
  if (!pid) return;
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
}

function classifyExitlessFailure(output: string): RunOutcome {
  if (/ETIMEDOUT|ECONNREFUSED|ECONNRESET|rate_limit|overloaded|529|503|emulator.*crash|simulator.*timeout/i.test(output)) {
    return "infra_error";
  }
  return "infra_error";
}
