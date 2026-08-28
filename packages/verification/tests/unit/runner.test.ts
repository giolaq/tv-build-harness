import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { GoldenSpec, VerifyConfig } from "@tv-build/shared-types";
import { runSuite } from "../../src/runner.js";

const ROOT = join(tmpdir(), "tv-build-verification-runner");
const FAKE = resolve("tests", "fixtures", "fake-harness.mjs");

beforeEach(() => {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(ROOT, { recursive: true });
});

describe("runner governance", () => {
  it("passes a fixed seed to every harness run and records it", async () => {
    const records = await runSuite({ specs: [spec()], config: config({ fixedSeed: "fixed-123" }) });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ seed: "fixed-123", seedPolicy: "fixed" });
    expect(records[0].env).toMatchObject({ seedPolicy: "fixed", fixedSeed: "fixed-123" });
  });

  it("omits --seed under random policy and records the harness-reported seed", async () => {
    const records = await runSuite({ specs: [spec()], config: config({ seedPolicy: "random", fixedSeed: undefined }) });
    expect(records[0]).toMatchObject({ seed: "fake-random-seed", seedPolicy: "random" });
  });

  it("fails config validation when maxBatchCostUsd is missing", async () => {
    const bad = config({}) as Partial<VerifyConfig>;
    delete bad.maxBatchCostUsd;
    await expect(runSuite({ specs: [spec()], config: bad as VerifyConfig })).rejects.toThrow(/maxBatchCostUsd/);
  });

  it("skips planned runs when estimated run cost would exceed batch budget", async () => {
    const records = await runSuite({
      specs: [spec()],
      config: config({ n: 2, maxBatchCostUsd: 5, estimatedRunCostUsd: 10 }),
    });
    expect(records).toHaveLength(2);
    expect(records.every((record) => record.outcome === "budget_abort" && record.skipped === "budget")).toBe(true);
  });

  it("stops later runs after reported spend consumes remaining budget", async () => {
    const records = await runSuite({
      specs: [spec()],
      config: config({
        n: 2,
        maxBatchCostUsd: 11,
        estimatedRunCostUsd: 10,
        harnessCommand: `${process.execPath} ${FAKE} claude-run --fake-cost 10.5`,
      }),
    });
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ outcome: "pass", costUsd: 10.5 });
    expect(records[1]).toMatchObject({ outcome: "budget_abort", skipped: "budget" });
  });

  it("treats generic harness abort exits as infrastructure errors", async () => {
    const records = await runSuite({
      specs: [spec()],
      config: config({ harnessCommand: `${process.execPath} ${FAKE} claude-run --fake-exit-code 4` }),
    });
    expect(records[0]).toMatchObject({ outcome: "infra_error" });
  });
});

function spec(): GoldenSpec {
  const inputDir = join(ROOT, "input");
  mkdirSync(inputDir, { recursive: true });
  return {
    id: "GS-test",
    name: "test",
    description: "test spec",
    tier: "easy",
    inputDir,
    expected: {
      files_exist: [],
      nav_routes: [],
      platforms_build: [],
    },
  };
}

function config(patch: Partial<VerifyConfig> = {}): VerifyConfig {
  return {
    n: 1,
    infraRetryMax: 0,
    seedPolicy: "fixed",
    fixedSeed: "runner-seed",
    maxBatchCostUsd: 20,
    estimatedRunCostUsd: 10,
    tierLevelMap: { easy: [], medium: [], hard: [] },
    regressionRule: "ci_below_point",
    artifactsDir: join(ROOT, "artifacts"),
    harnessCommand: `${process.execPath} ${FAKE} claude-run`,
    ...patch,
  };
}
