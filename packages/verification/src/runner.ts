import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunRecord, GoldenSpec, VerifyConfig, CheckResult, RunOutcome, Platform, BuildErrorClass } from "@tv-harness/shared-types";
import { runHarness, captureEnv } from "./harnessClient.js";
import { runStructuralChecks } from "./levels/structural.js";
import { runBuildChecks } from "./levels/build.js";

export interface RunnerOptions {
  specs: GoldenSpec[];
  config: VerifyConfig;
  onProgress?: (specId: string, run: number, total: number) => void;
}

function isInfraError(error: string): boolean {
  const infraPatterns = [
    "ETIMEDOUT", "ECONNREFUSED", "ECONNRESET",
    "rate_limit", "overloaded", "529", "503",
    "emulator.*crash", "simulator.*timeout",
  ];
  return infraPatterns.some(p => new RegExp(p, "i").test(error));
}

export async function runSuite(options: RunnerOptions): Promise<RunRecord[]> {
  const { specs, config, onProgress } = options;
  const records: RunRecord[] = [];
  const env = captureEnv();

  for (const spec of specs) {
    const n = config.perSpecN?.[spec.id] ?? config.n;
    const levels = config.tierLevelMap[spec.tier];

    for (let i = 0; i < n; i++) {
      onProgress?.(spec.id, i + 1, n);
      const record = await runSingleSpec(spec, levels, config, env);
      records.push(record);

      // Retry infra errors up to infraRetryMax
      if (record.outcome === "infra_error") {
        let retries = 0;
        while (retries < config.infraRetryMax && records[records.length - 1].outcome === "infra_error") {
          retries++;
          onProgress?.(spec.id, i + 1, n);
          const retry = await runSingleSpec(spec, levels, config, env);
          retry.retryOf = record.id;
          records.push(retry);
        }
      }
    }
  }

  // Write artifacts
  const artifactsDir = config.artifactsDir;
  mkdirSync(artifactsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const bundlePath = join(artifactsDir, `run-${timestamp}.json`);
  const scrubbed = records.map(r => scrubSecrets(r));
  writeFileSync(bundlePath, JSON.stringify(scrubbed, null, 2));

  return records;
}

async function runSingleSpec(
  spec: GoldenSpec,
  levels: number[],
  config: VerifyConfig,
  env: ReturnType<typeof captureEnv>,
): Promise<RunRecord> {
  const id = randomUUID();
  const checks: CheckResult[] = [];
  let costUsd = 0;
  let latencyS = 0;
  let outcome: RunOutcome = "pass";
  let appPath = "";
  let error: string | undefined;

  try {
    const start = Date.now();
    const result = runHarness(spec.inputDir, { command: config.harnessCommand });
    latencyS = (Date.now() - start) / 1000;
    costUsd = result.costUsd;
    appPath = result.appPath;

    // Level 1: Structural
    if (levels.includes(1)) {
      const structural = runStructuralChecks(appPath, spec.expected);
      checks.push(...structural);
    }

    // Level 2: Build
    if (levels.includes(2) && spec.expected.platforms_build.length > 0) {
      const buildChecks = runBuildChecks(appPath, spec.expected.platforms_build);
      checks.push(...buildChecks);
    }

    // Level 3: Smoke/Focus (placeholder — requires Detox setup)
    // Level 4: Content fidelity (placeholder)
    // Level 5: Rubric/Judge (placeholder)

    // Determine outcome from checks
    const hasFail = checks.some(c => c.severity === "fail");
    outcome = hasFail ? "harness_failure" : "pass";
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error = msg;
    outcome = isInfraError(msg) ? "infra_error" : "harness_failure";
  }

  const buildResults: RunRecord["buildResults"] = {} as RunRecord["buildResults"];
  for (const check of checks) {
    if (check.name.startsWith("build:")) {
      const platform = check.name.replace("build:", "") as Platform;
      const details = check.details as { timeS: number; errorClass?: string } | undefined;
      buildResults[platform] = {
        pass: check.severity === "pass",
        errorClass: details?.errorClass as BuildErrorClass | undefined,
        timeS: details?.timeS ?? 0,
      };
    }
  }

  return {
    id,
    specId: spec.id,
    tier: spec.tier,
    outcome,
    env,
    costUsd,
    latencyS,
    checks,
    buildResults,
    artifactPath: appPath || undefined,
    error,
  };
}

function scrubSecrets(record: RunRecord): RunRecord {
  const json = JSON.stringify(record);
  const scrubbed = json
    .replace(/sk-ant-[a-zA-Z0-9_-]+/g, "[REDACTED]")
    .replace(/ANTHROPIC_API_KEY[^"]*"[^"]*"/g, 'ANTHROPIC_API_KEY":"[REDACTED]"')
    .replace(/Bearer [a-zA-Z0-9._-]+/g, "Bearer [REDACTED]");
  return JSON.parse(scrubbed);
}
