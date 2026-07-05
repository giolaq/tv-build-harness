import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { GoldenSpec, VerifyConfig } from "@tv-build/shared-types";
import { runSuite } from "../../src/runner.js";

const ROOT = join(tmpdir(), "tv-build-verification-runner");
const TSX = resolve("..", "harness", "node_modules", ".bin", "tsx");
const FAKE = resolve("tests", "fixtures", "fake-harness.ts");

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

  it("skips planned runs before launching when per-run cost would exceed batch budget", async () => {
    const records = await runSuite({
      specs: [spec()],
      config: config({ n: 2, maxBatchCostUsd: 5, perRunMaxCostUsd: 10 }),
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
        perRunMaxCostUsd: 10,
        harnessCommand: `${TSX} ${FAKE} claude-run --fake-cost 10.5`,
      }),
    });
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ outcome: "pass", costUsd: 10.5 });
    expect(records[1]).toMatchObject({ outcome: "budget_abort", skipped: "budget" });
  });

  it("records budget-aborted harness exits as budget_abort", async () => {
    const records = await runSuite({
      specs: [spec()],
      config: config({ harnessCommand: `${TSX} ${FAKE} claude-run --fake-exit-code 4` }),
    });
    expect(records[0]).toMatchObject({ outcome: "budget_abort" });
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
    perRunMaxCostUsd: 10,
    tierLevelMap: { easy: [], medium: [], hard: [] },
    regressionRule: "ci_below_point",
    artifactsDir: join(ROOT, "artifacts"),
    harnessCommand: `${TSX} ${FAKE} claude-run`,
    ...patch,
  };
}
