import { execSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { PinnedEnv } from "@tv-harness/shared-types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const HARNESS_DIR = join(REPO_ROOT, "packages/harness");
const HARNESS_OUT = join(HARNESS_DIR, "out");

export interface HarnessResult {
  runId: string;
  appPath: string;
  costUsd: number;
  latencyS: number;
  specPath: string;
  reportPath: string;
  logPath: string;
  env: PinnedEnv;
}

export function runHarness(
  inputDir: string,
  options?: { command?: string; extraArgs?: string[] },
): HarnessResult {
  const command = options?.command ?? `npx tsx ${join(HARNESS_DIR, "src/index.ts")} claude-run`;
  const extraArgs = options?.extraArgs ?? [];
  const resolvedInput = resolve(inputDir);
  const args = ["--generate-only", "--no-tui", ...extraArgs, resolvedInput];
  const fullCommand = `${command} ${args.join(" ")}`;

  const startTime = Date.now();

  const stdout = execSync(fullCommand, {
    encoding: "utf-8",
    cwd: HARNESS_DIR,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 600_000,
  });

  const endTime = Date.now();

  // Parse the runId from output — look for "out/<runId>/" pattern
  const runIdMatch = stdout.match(/out\/([a-zA-Z0-9_-]+)\//);
  const runId = runIdMatch?.[1] ?? findLatestRunId();

  const harnessOutDir = join(HARNESS_OUT, runId);
  const reportPath = join(harnessOutDir, "report.md");
  const logPath = join(harnessOutDir, "run.log");
  const appPath = join(harnessOutDir, "app");

  // Extract cost from report.md
  const costUsd = extractCost(reportPath);

  // Compute latency from run.log NDJSON (first to last timestamp)
  const latencyS = extractLatency(logPath, startTime, endTime);

  const env = captureEnv();

  return {
    runId,
    appPath,
    costUsd,
    latencyS,
    specPath: resolvedInput,
    reportPath,
    logPath,
    env,
  };
}

export function captureEnv(): PinnedEnv {
  const nodeVersion = process.version;

  let claudeCliVersion = "unknown";
  try {
    claudeCliVersion = execSync("claude --version", { encoding: "utf-8" }).trim();
  } catch {
    // Claude CLI may not be available
  }

  let harnessCommit = "unknown";
  try {
    harnessCommit = execSync("git rev-parse --short HEAD", {
      encoding: "utf-8",
    }).trim();
  } catch {
    // Not in a git repo or git not available
  }

  return {
    modelPlan: "unknown",
    modelExecution: "unknown",
    templateRepo: "unknown",
    templateBranch: "unknown",
    nodeVersion,
    claudeCliVersion,
    harnessCommit,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Find the most recently created run directory in packages/harness/out/.
 */
function findLatestRunId(): string {
  const outDir = HARNESS_OUT;
  if (!existsSync(outDir)) {
    throw new Error(`Harness output directory not found: ${outDir}`);
  }

  const entries = readdirSync(outDir, { withFileTypes: true })
    .filter((e: { isDirectory(): boolean }) => e.isDirectory())
    .map((e: { name: string }) => e.name);

  if (entries.length === 0) {
    throw new Error(`No run directories found in ${outDir}`);
  }

  // Return the last entry alphabetically (UUIDs/timestamps sort chronologically)
  entries.sort();
  return entries[entries.length - 1];
}

/**
 * Extract total cost from report.md.
 * Looks for a line like "Total cost: $0.1234" or "**Total cost:** $0.1234".
 */
function extractCost(reportPath: string): number {
  if (!existsSync(reportPath)) {
    return 0;
  }

  const content = readFileSync(reportPath, "utf-8");
  const costMatch = content.match(/Total cost[:\s]*\$?([\d.]+)/i);
  if (costMatch) {
    return parseFloat(costMatch[1]);
  }
  return 0;
}

/**
 * Extract latency from run.log NDJSON.
 * Each line is a JSON object with a "timestamp" field (ISO string or epoch ms).
 * Returns the difference between first and last timestamp in seconds.
 * Falls back to wall-clock timing if parsing fails.
 */
function extractLatency(
  logPath: string,
  wallStartMs: number,
  wallEndMs: number,
): number {
  if (!existsSync(logPath)) {
    return (wallEndMs - wallStartMs) / 1000;
  }

  const content = readFileSync(logPath, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);

  if (lines.length < 2) {
    return (wallEndMs - wallStartMs) / 1000;
  }

  try {
    const firstLine = JSON.parse(lines[0]) as { timestamp?: string | number };
    const lastLine = JSON.parse(lines[lines.length - 1]) as {
      timestamp?: string | number;
    };

    const firstTs = parseTimestamp(firstLine.timestamp);
    const lastTs = parseTimestamp(lastLine.timestamp);

    if (firstTs !== null && lastTs !== null) {
      return (lastTs - firstTs) / 1000;
    }
  } catch {
    // Fall through to wall-clock timing
  }

  return (wallEndMs - wallStartMs) / 1000;
}

/**
 * Parse a timestamp value (ISO string or epoch ms) into epoch ms.
 */
function parseTimestamp(value: string | number | undefined): number | null {
  if (value === undefined) return null;

  if (typeof value === "number") {
    return value;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}
