import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunRecord, GoldenSpec, VerifyConfig, CheckResult, RunOutcome, Platform, BuildErrorClass, RubricScore } from "@tv-build/shared-types";
import { HarnessRunError, runHarness, captureEnv } from "./harnessClient.js";
import { runStructuralChecks } from "./levels/structural.js";
import { runBuildChecks } from "./levels/build.js";
import { runSmokeChecks } from "./levels/smoke.js";
import { runContentChecks } from "./levels/content.js";
import { JUDGE_PROMPT_HASH, runRubricChecks } from "./levels/rubric.js";

export interface RunnerOptions {
  specs: GoldenSpec[];
  config: VerifyConfig;
  onProgress?: (specId: string, run: number, total: number) => void;
}

interface NormalizedVerifyConfig extends VerifyConfig {
  seedPolicy: "fixed" | "random";
  fixedSeed: string;
  perRunMaxCostUsd: number;
}

function isInfraError(error: string): boolean {
  const infraPatterns = [
    "ETIMEDOUT", "ECONNREFUSED", "ECONNRESET",
    "rate_limit", "overloaded", "529", "503",
    "emulator.*crash", "simulator.*timeout",
  ];
  return infraPatterns.some(p => new RegExp(p, "i").test(error));
}

function classifyRunError(err: unknown): RunOutcome {
  if (err instanceof HarnessRunError) return err.outcome;
  const msg = err instanceof Error ? err.message : String(err);
  const outcome = isInfraError(msg) ? "infra_error" : "harness_failure";
  console.warn(`Harness failure had no exit-code contract; using text fallback: ${outcome}`);
  return outcome;
}

export async function runSuite(options: RunnerOptions): Promise<RunRecord[]> {
  const { specs, onProgress } = options;
  const config = normalizeConfig(options.config);
  const records: RunRecord[] = [];
  const env = captureEnv({
    seedPolicy: config.seedPolicy,
    fixedSeed: config.seedPolicy === "fixed" ? config.fixedSeed : undefined,
    judge: config.judge ? { model: config.judge.model, promptHash: JUDGE_PROMPT_HASH } : undefined,
  });
  let spentUsd = 0;

  for (const spec of specs) {
    const n = config.perSpecN?.[spec.id] ?? config.n;
    const levels = config.tierLevelMap[spec.tier];

    for (let i = 0; i < n; i++) {
      if (spentUsd + config.perRunMaxCostUsd > config.maxBatchCostUsd) {
        records.push(skippedBudgetRecord(spec, config, env, `Batch budget would be exceeded before run ${i + 1}/${n}`));
        continue;
      }

      onProgress?.(spec.id, i + 1, n);
      const record = await runSingleSpec(spec, levels, config, env);
      records.push(record);
      spentUsd += record.costUsd + (record.judgeCostUsd ?? 0);

      // Retry infra errors up to infraRetryMax
      if (record.outcome === "infra_error") {
        let retries = 0;
        while (retries < config.infraRetryMax && records[records.length - 1].outcome === "infra_error") {
          if (spentUsd + config.perRunMaxCostUsd > config.maxBatchCostUsd) {
            records.push(skippedBudgetRecord(spec, config, env, `Batch budget would be exceeded before retry ${retries + 1}`));
            break;
          }
          retries++;
          onProgress?.(spec.id, i + 1, n);
          const retry = await runSingleSpec(spec, levels, config, env);
          retry.retryOf = record.id;
          records.push(retry);
          spentUsd += retry.costUsd + (retry.judgeCostUsd ?? 0);
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

function normalizeConfig(config: VerifyConfig): NormalizedVerifyConfig {
  if (typeof config.maxBatchCostUsd !== "number" || !Number.isFinite(config.maxBatchCostUsd) || config.maxBatchCostUsd <= 0) {
    throw new Error("verify.config.json must set maxBatchCostUsd to a positive number.");
  }
  return {
    ...config,
    seedPolicy: config.seedPolicy ?? "fixed",
    fixedSeed: config.fixedSeed ?? "verification-fixed-seed",
    perRunMaxCostUsd: config.perRunMaxCostUsd ?? 10,
  };
}

async function runSingleSpec(
  spec: GoldenSpec,
  levels: number[],
  config: VerifyConfig,
  env: ReturnType<typeof captureEnv>,
): Promise<RunRecord> {
  const normalized = normalizeConfig(config);
  const id = randomUUID();
  const checks: CheckResult[] = [];
  let costUsd = 0;
  let judgeCostUsd = 0;
  let latencyS = 0;
  let outcome: RunOutcome = "pass";
  let appPath = "";
  let error: string | undefined;
  let rubricScore: RubricScore | undefined;
  let seed: string | undefined = normalized.seedPolicy === "fixed" ? normalized.fixedSeed : undefined;

  try {
    const start = Date.now();
    const result = await runHarness(spec.inputDir, {
      command: normalized.harnessCommand,
      seed: normalized.seedPolicy === "fixed" ? normalized.fixedSeed : undefined,
      maxCostUsd: normalized.perRunMaxCostUsd,
      seedPolicy: normalized.seedPolicy,
      fixedSeed: normalized.seedPolicy === "fixed" ? normalized.fixedSeed : undefined,
      judge: normalized.judge ? { model: normalized.judge.model, promptHash: JUDGE_PROMPT_HASH } : undefined,
    });
    latencyS = (Date.now() - start) / 1000;
    costUsd = result.costUsd;
    appPath = result.appPath;
    seed = result.seed ?? seed;

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

    // Level 3: Smoke/Focus
    if (levels.includes(3)) {
      const smokeChecks = await runSmokeChecks({ appPath });
      checks.push(...smokeChecks);
    }

    // Level 4: Content fidelity
    if (levels.includes(4)) {
      const contentChecks = runContentChecks(appPath, spec.inputDir, spec.expected);
      checks.push(...contentChecks);
    }

    // Level 5: Rubric/Judge
    if (levels.includes(5)) {
      const judgeConfig = config.judge
        ? { model: config.judge.model, validated: config.judge.validated, apiKey: process.env.ANTHROPIC_API_KEY, costUsd: 0 }
        : undefined;
      const { checks: rubricChecks, rubric } = await runRubricChecks(
        appPath,
        spec.description,
        spec.expected,
        judgeConfig,
      );
      checks.push(...rubricChecks);
      if (rubric) {
        rubricScore = rubric;
        judgeCostUsd = rubric.judgeCostUsd ?? 0;
      }
    }

    // Determine outcome from checks
    const hasFail = checks.some(c => c.severity === "fail");
    outcome = hasFail ? "harness_failure" : "pass";
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error = msg;
    outcome = classifyRunError(err);
    if (err instanceof HarnessRunError) {
      costUsd = err.details.costUsd ?? costUsd;
      seed = err.details.seed ?? seed;
    }
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
    seed,
    seedPolicy: normalized.seedPolicy,
    env,
    costUsd,
    judgeCostUsd,
    latencyS,
    checks,
    buildResults,
    rubric: rubricScore,
    artifactPath: appPath || undefined,
    error,
  };
}

function skippedBudgetRecord(
  spec: GoldenSpec,
  config: NormalizedVerifyConfig,
  env: ReturnType<typeof captureEnv>,
  message: string,
): RunRecord {
  return {
    id: randomUUID(),
    specId: spec.id,
    tier: spec.tier,
    outcome: "budget_abort",
    seed: config.seedPolicy === "fixed" ? config.fixedSeed : undefined,
    seedPolicy: config.seedPolicy,
    env,
    costUsd: 0,
    judgeCostUsd: 0,
    latencyS: 0,
    checks: [],
    buildResults: {} as RunRecord["buildResults"],
    skipped: "budget",
    error: message,
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
