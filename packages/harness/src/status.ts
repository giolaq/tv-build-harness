import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadCheckpoint } from "./checkpoint.js";
import type { Phase } from "./types.js";

export type RunLifecycleState = "starting" | "running" | "complete" | "failed" | "aborted";

export interface RunStatusFile {
  runId: string;
  pid?: number;
  state: RunLifecycleState;
  outDir: string;
  startedAt: string;
  updatedAt: string;
  currentPhase?: Phase;
  costSoFar?: number;
  exitCode?: number;
  reason?: string;
}

export interface RunStatusSummary extends RunStatusFile {
  phasesComplete: string[];
  lastLogLines: string[];
  stalePid?: boolean;
}

const STATUS_FILE = "status.json";
const PID_FILE = "pid";

export function outDirForRun(baseDir: string, runId: string): string {
  return join(baseDir, "out", runId);
}

export function initRunStatus(outDir: string, input: { runId: string; pid?: number }): RunStatusFile {
  mkdirSync(outDir, { recursive: true });
  const now = new Date().toISOString();
  const status: RunStatusFile = {
    runId: input.runId,
    pid: input.pid,
    state: "starting",
    outDir,
    startedAt: now,
    updatedAt: now,
  };
  writeRunStatus(outDir, status);
  if (input.pid) writeFileSync(join(outDir, PID_FILE), `${input.pid}\n`);
  return status;
}

export function updateRunStatus(outDir: string, patch: Partial<RunStatusFile>): RunStatusFile {
  const current = readRunStatus(outDir) ?? {
    runId: outDir.split("/").pop() ?? "unknown",
    state: "running",
    outDir,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const next: RunStatusFile = { ...current, ...patch, updatedAt: new Date().toISOString() };
  writeRunStatus(outDir, next);
  return next;
}

export function readRunStatus(outDir: string): RunStatusFile | null {
  const path = join(outDir, STATUS_FILE);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as RunStatusFile & { budget?: unknown };
    const { budget: _removedBudget, ...status } = parsed;
    return status;
  } catch {
    return null;
  }
}

export function summarizeRun(baseDir: string, runId: string): RunStatusSummary | null {
  const outDir = outDirForRun(baseDir, runId);
  if (!existsSync(outDir)) return null;

  const status = readRunStatus(outDir) ?? inferStatus(outDir, runId);
  const checkpoint = loadCheckpoint(outDir);
  const pid = status.pid ?? readPid(outDir);
  const pidAlive = pid ? isPidAlive(pid) : false;
  const inferredFailure = inferFailureFromLog(outDir);
  const stalePid = (status.state === "running" || status.state === "starting") && Boolean(pid) && !pidAlive;
  const state: RunLifecycleState = stalePid || inferredFailure ? "failed" : status.state;

  return {
    ...status,
    pid,
    state,
    stalePid,
    exitCode: state === "failed" && status.exitCode === undefined ? 2 : status.exitCode,
    reason: inferredFailure && !status.reason ? "child_exit" : status.reason,
    phasesComplete: checkpoint?.completedPhases ?? [],
    currentPhase: status.currentPhase ?? currentPhaseFromLog(outDir),
    lastLogLines: tailLog(outDir, 20),
  };
}

export function abortRun(baseDir: string, runId: string): RunStatusSummary | null {
  const outDir = outDirForRun(baseDir, runId);
  const status = summarizeRun(baseDir, runId);
  if (!status) return null;
  const pid = status.pid;
  if (pid && isPidAlive(pid)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  updateRunStatus(outDir, { state: "aborted", reason: "user", exitCode: 4 });
  return summarizeRun(baseDir, runId);
}

function writeRunStatus(outDir: string, status: RunStatusFile): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, STATUS_FILE), JSON.stringify(status, null, 2));
}

function readPid(outDir: string): number | undefined {
  const path = join(outDir, PID_FILE);
  if (!existsSync(path)) return undefined;
  const pid = Number(readFileSync(path, "utf-8").trim());
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function inferStatus(outDir: string, runId: string): RunStatusFile {
  const updatedAt = statSync(outDir).mtime.toISOString();
  return {
    runId,
    state: existsSync(join(outDir, "report.md")) ? "complete" : "running",
    outDir: resolve(outDir),
    startedAt: updatedAt,
    updatedAt,
  };
}

function currentPhaseFromLog(outDir: string): string | undefined {
  const lines = readLogLines(outDir);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]) as { event?: string; phase?: string };
      if (entry.event === "phase_start" && entry.phase) return entry.phase;
    } catch {
      continue;
    }
  }
  return undefined;
}

function tailLog(outDir: string, count: number): string[] {
  return readLogLines(outDir).slice(-count);
}

function readLogLines(outDir: string): string[] {
  const path = join(outDir, "run.log");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8").split("\n").filter(Boolean);
}

function inferFailureFromLog(outDir: string): boolean {
  const lines = readLogLines(outDir).slice(-20);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    try {
      const entry = JSON.parse(line) as {
        event?: string;
        status?: string;
        error?: unknown;
        state?: string;
      };
      if (entry.event === "run_complete" && entry.status === "success") return false;
      if (entry.event === "run_complete" && entry.status === "failed") return true;
      if (entry.error) return true;
      if (entry.state === "failed") return true;
    } catch {
      if (/fatal error|missing_api_credentials|doctor_failed|run failed|error:/i.test(line)) return true;
    }
  }
  return false;
}
