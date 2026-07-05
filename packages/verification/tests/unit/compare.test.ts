import { describe, expect, it } from "vitest";
import type { PinnedEnv, RunRecord } from "@tv-build/shared-types";
import { compareRunBundles, diffPinnedEnv, formatVerdictTable } from "../../src/report/compare.js";

describe("compare environment guard", () => {
  it("allows matching environments", () => {
    const result = compareRunBundles([record("base", env())], [record("head", env())]);
    expect(result.envDiffs).toEqual([]);
    expect(result.banner).toBeUndefined();
  });

  it.each([
    ["modelPlan", { modelPlan: "other" }],
    ["modelExecution", { modelExecution: "other" }],
    ["templateCommits", { templateCommits: { repo: "def" } }],
    ["seedPolicy", { seedPolicy: "random", fixedSeed: undefined }],
    ["fixedSeed", { fixedSeed: "other-seed" }],
    ["judge", { judge: { model: "other", promptHash: "hash" } }],
  ] as const)("refuses drift in %s", (_field, patch) => {
    expect(() => compareRunBundles([record("base", env())], [record("head", env(patch))]))
      .toThrow(/Refusing confounded comparison/);
  });

  it("warns but does not refuse Node and Claude CLI version drift", () => {
    const diffs = diffPinnedEnv(env(), env({ nodeVersion: "v2", claudeCliVersion: "other" }));
    expect(diffs).toEqual([
      expect.objectContaining({ field: "nodeVersion", severity: "warn" }),
      expect.objectContaining({ field: "claudeCliVersion", severity: "warn" }),
    ]);
  });

  it("allows explicit environment drift override and stamps a banner", () => {
    const result = compareRunBundles(
      [record("base", env())],
      [record("head", env({ seedPolicy: "random", fixedSeed: undefined }))],
      { allowEnvDrift: true },
    );
    expect(result.banner).toContain("CONFOUNDED COMPARISON");
    expect(result.envDiffs.some((diff) => diff.severity === "refuse")).toBe(true);
  });

  it("tolerates empty bundles without env diffs", () => {
    const result = compareRunBundles([], []);
    expect(result).toMatchObject({ verdicts: [], envDiffs: [] });
  });

  it("formats comparison verdict tables", () => {
    const result = compareRunBundles([record("base", env())], [record("head", env())]);
    expect(formatVerdictTable(result.verdicts)).toContain("| Metric | Base Rate | Head Rate |");
  });
});

function env(patch: Partial<PinnedEnv> = {}): PinnedEnv {
  return {
    modelPlan: "plan",
    modelExecution: "exec",
    templateRepo: "repo",
    templateCommits: { repo: "abc" },
    seedPolicy: "fixed",
    fixedSeed: "seed",
    judge: { model: "judge", promptHash: "hash" },
    nodeVersion: "v1",
    claudeCliVersion: "claude",
    harnessCommit: "commit",
    timestamp: "time",
    ...patch,
  };
}

function record(id: string, pinnedEnv: PinnedEnv): RunRecord {
  return {
    id,
    specId: "GS-01",
    tier: "easy",
    outcome: "pass",
    seed: pinnedEnv.fixedSeed,
    seedPolicy: pinnedEnv.seedPolicy,
    env: pinnedEnv,
    costUsd: 0,
    latencyS: 0,
    checks: [],
    buildResults: {},
  };
}
