import { describe, expect, it } from "vitest";
import type { RunRecord } from "@tv-build/shared-types";
import { aggregate } from "../../src/report/aggregate.js";

describe("aggregate invariants", () => {
  it("excludes infra errors from pass-rate denominators", () => {
    const metrics = aggregate([record("pass-1", "pass"), record("infra-1", "infra_error")]);
    expect(metric(metrics, "overall_pass_rate")).toMatchObject({ n: 1, k: 1 });
    expect(metric(metrics, "infra_error_rate")).toMatchObject({ n: 2, k: 1 });
  });

  it("excludes budget aborts and skipped budget records from pass-rate denominators", () => {
    const metrics = aggregate([
      record("pass-1", "pass"),
      record("budget-1", "budget_abort"),
      { ...record("skip-1", "budget_abort"), skipped: "budget" },
    ]);
    expect(metric(metrics, "overall_pass_rate")).toMatchObject({ n: 1, k: 1 });
    expect(metric(metrics, "budget_abort_rate")).toMatchObject({ n: 3, k: 2 });
  });

  it("excludes retry attempts superseded by a later retry", () => {
    const metrics = aggregate([
      record("attempt-1", "infra_error"),
      { ...record("attempt-2", "pass"), retryOf: "attempt-1" },
      { ...record("attempt-3", "harness_failure"), retryOf: "attempt-2" },
    ]);
    expect(metric(metrics, "overall_pass_rate")).toMatchObject({ n: 1, k: 0 });
  });

  it("does not let retry chains inflate N", () => {
    const metrics = aggregate([
      record("run-1", "pass"),
      record("retry-root", "infra_error"),
      { ...record("retry-final", "pass"), retryOf: "retry-root" },
    ]);
    expect(metric(metrics, "overall_pass_rate")).toMatchObject({ n: 2, k: 2 });
  });

  it("uses only records that actually ran structural checks", () => {
    const metrics = aggregate([
      { ...record("with-struct", "pass"), checks: [{ level: 1, name: "files", severity: "pass", message: "ok" }] },
      record("without-struct", "pass"),
    ]);
    expect(metric(metrics, "structural_pass_rate")).toMatchObject({ n: 1, k: 1 });
  });

  it("uses per-platform build denominators", () => {
    const metrics = aggregate([
      { ...record("web-pass", "pass"), buildResults: { web: { pass: true, timeS: 1 } } },
      { ...record("web-fail", "harness_failure"), buildResults: { web: { pass: false, timeS: 1 } } },
      { ...record("android-pass", "pass"), buildResults: { androidtv: { pass: true, timeS: 1 } } },
    ]);
    expect(metric(metrics, "build_pass_rate:web")).toMatchObject({ n: 2, k: 1 });
    expect(metric(metrics, "build_pass_rate:androidtv")).toMatchObject({ n: 1, k: 1 });
  });

  it("uses only focus-check records for focus pass rate", () => {
    const metrics = aggregate([
      { ...record("focus-pass", "pass"), checks: [{ level: 3, name: "focus_nodes", severity: "pass", message: "ok" }] },
      { ...record("focus-fail", "harness_failure"), checks: [{ level: 3, name: "focus_nodes", severity: "fail", message: "bad" }] },
      record("no-focus", "pass"),
    ]);
    expect(metric(metrics, "focus_nav_pass_rate")).toMatchObject({ n: 2, k: 1 });
  });

  it("computes cost and latency from valid non-superseded records only", () => {
    const metrics = aggregate([
      { ...record("a", "pass"), costUsd: 1, latencyS: 10 },
      { ...record("b", "harness_failure"), costUsd: 3, latencyS: 30 },
      { ...record("c", "infra_error"), costUsd: 100, latencyS: 1000 },
    ]);
    expect(metric(metrics, "avg_cost_usd")).toMatchObject({ n: 2, rate: 2 });
    expect(metric(metrics, "avg_latency_s")).toMatchObject({ n: 2, rate: 20 });
  });

  it("returns only infra metrics when every run is infra", () => {
    const metrics = aggregate([record("infra-1", "infra_error"), record("infra-2", "infra_error")]);
    expect(metrics.map((m) => m.metric)).toEqual(["infra_error_rate"]);
  });

  it("returns only budget metrics when every run is budget skipped", () => {
    const metrics = aggregate([{ ...record("skip", "budget_abort"), skipped: "budget" }]);
    expect(metrics.map((m) => m.metric)).toEqual(["budget_abort_rate"]);
  });
});

function metric(metrics: ReturnType<typeof aggregate>, name: string) {
  const found = metrics.find((m) => m.metric === name);
  expect(found).toBeTruthy();
  return found!;
}

function record(id: string, outcome: RunRecord["outcome"]): RunRecord {
  return {
    id,
    specId: "GS-01",
    tier: "easy",
    outcome,
    seed: "seed",
    seedPolicy: "fixed",
    env: {
      modelPlan: "plan",
      modelExecution: "exec",
      templateRepo: "repo",
      templateCommits: { repo: "abc" },
      seedPolicy: "fixed",
      fixedSeed: "seed",
      nodeVersion: "v1",
      claudeCliVersion: "claude",
      harnessCommit: "commit",
      timestamp: "time",
    },
    costUsd: 0,
    latencyS: 0,
    checks: [],
    buildResults: {},
  };
}
