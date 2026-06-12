import { describe, it, expect } from "vitest";
import { runPipeline, selectActivePhases } from "../src/pipeline-engine.js";
import { PhaseSpecSchema } from "../src/harness-config.js";
import type { PhaseSpec } from "../src/harness-config.js";
import type { PhaseResult, PhaseStatus } from "../src/types.js";

function phase(name: string, overrides: Partial<PhaseSpec> = {}): PhaseSpec {
  return { ...PhaseSpecSchema.parse({ name }), ...overrides };
}

// Builds an executor that returns scripted statuses per phase (consumed in order).
function scriptedExecutor(script: Record<string, PhaseStatus[]>) {
  const calls: Array<{ phase: string; attempt: number }> = [];
  const executor = async (spec: PhaseSpec, attempt: number): Promise<PhaseResult> => {
    calls.push({ phase: spec.name, attempt });
    const statuses = script[spec.name] ?? ["success"];
    const status = statuses.shift() ?? statuses[0] ?? "success";
    return {
      phase: spec.name,
      status,
      iterations: 1,
      error: status === "success" ? undefined : `scripted ${status}`,
    };
  };
  return { executor, calls };
}

describe("runPipeline", () => {
  it("runs all phases in order on the happy path", async () => {
    const { executor, calls } = scriptedExecutor({});
    const results = await runPipeline({
      phases: [phase("a"), phase("b"), phase("c")],
      executor,
      maxRetries: 3,
    });

    expect(calls.map((c) => c.phase)).toEqual(["a", "b", "c"]);
    expect([...results.values()].every((r) => r.status === "success")).toBe(true);
  });

  it("retries a degraded phase up to maxRetries", async () => {
    const { executor, calls } = scriptedExecutor({
      a: ["degraded", "degraded", "success"],
    });
    const results = await runPipeline({
      phases: [phase("a")],
      executor,
      maxRetries: 5,
    });

    expect(calls.filter((c) => c.phase === "a")).toHaveLength(3);
    expect(results.get("a")!.status).toBe("success");
  });

  it("exhausts retries and keeps the last result", async () => {
    const { executor, calls } = scriptedExecutor({
      a: ["degraded", "degraded", "degraded"],
    });
    const results = await runPipeline({
      phases: [phase("a"), phase("b")],
      executor,
      maxRetries: 3,
    });

    expect(calls.filter((c) => c.phase === "a")).toHaveLength(3);
    expect(results.get("a")!.status).toBe("degraded");
    // degraded counts as completed — downstream phases still run
    expect(results.get("b")!.status).toBe("success");
  });

  it("respects per-phase retries override", async () => {
    const { executor, calls } = scriptedExecutor({ a: ["degraded", "degraded", "degraded"] });
    await runPipeline({
      phases: [phase("a", { retries: 2 })],
      executor,
      maxRetries: 5,
    });
    expect(calls).toHaveLength(2);
  });

  it("retries an abortOnFailure phase, then aborts the pipeline when retries are exhausted", async () => {
    const { executor, calls } = scriptedExecutor({ plan: ["failed", "failed"] });
    const results = await runPipeline({
      phases: [phase("plan", { abortOnFailure: true, retries: 2 }), phase("b")],
      executor,
      maxRetries: 5,
    });

    expect(calls).toHaveLength(2);
    expect(results.get("plan")!.status).toBe("failed");
    expect(results.has("b")).toBe(false);
  });

  it("recovers when an abortOnFailure phase succeeds on a retry", async () => {
    const { executor, calls } = scriptedExecutor({ plan: ["failed", "success"] });
    const results = await runPipeline({
      phases: [phase("plan", { abortOnFailure: true, retries: 2 }), phase("b")],
      executor,
      maxRetries: 5,
    });

    expect(calls.filter((c) => c.phase === "plan")).toHaveLength(2);
    expect(results.get("plan")!.status).toBe("success");
    expect(results.get("b")!.status).toBe("success");
  });

  it("blocks phases whose dependencies failed", async () => {
    const { executor, calls } = scriptedExecutor({ b: ["failed", "failed", "failed"] });
    const results = await runPipeline({
      phases: [phase("a"), phase("b"), phase("c", { deps: ["b"] }), phase("d", { deps: ["a"] })],
      executor,
      maxRetries: 3,
    });

    expect(results.get("c")!.status).toBe("failed");
    expect(results.get("c")!.error).toContain("Blocked by failed dependency: b");
    // c was never executed, d was (its dep succeeded)
    expect(calls.some((c) => c.phase === "c")).toBe(false);
    expect(results.get("d")!.status).toBe("success");
  });

  it("ignores dependencies that are not in the active phase list", async () => {
    const { executor } = scriptedExecutor({});
    const results = await runPipeline({
      phases: [phase("c", { deps: ["build_loop"] })],
      executor,
      maxRetries: 1,
    });
    expect(results.get("c")!.status).toBe("success");
  });

  it("does not retry internalLoop phases", async () => {
    const { executor, calls } = scriptedExecutor({ qa: ["degraded"] });
    await runPipeline({
      phases: [phase("qa", { internalLoop: true })],
      executor,
      maxRetries: 5,
    });
    expect(calls).toHaveLength(1);
  });

  it("skips completed phases on resume and treats them as successful deps", async () => {
    const { executor, calls } = scriptedExecutor({});
    const skipped: string[] = [];
    const results = await runPipeline({
      phases: [phase("a"), phase("b", { deps: ["a"] }), phase("c", { deps: ["b"] })],
      executor,
      maxRetries: 3,
      completed: new Set(["a", "b"]),
      hooks: { onPhaseSkipped: (s) => skipped.push(s.name) },
    });

    expect(skipped).toEqual(["a", "b"]);
    expect(calls.map((c) => c.phase)).toEqual(["c"]);
    expect(results.get("a")!.iterations).toBe(0);
    expect(results.get("c")!.status).toBe("success");
  });

  it("stops between phases when shouldStop returns a reason", async () => {
    const { executor, calls } = scriptedExecutor({});
    let budget = 1;
    await runPipeline({
      phases: [phase("a"), phase("b"), phase("c")],
      executor,
      maxRetries: 1,
      hooks: { shouldStop: () => (budget-- > 0 ? null : "budget exhausted") },
    });
    expect(calls.map((c) => c.phase)).toEqual(["a"]);
  });

  it("calls onPhaseSuccess only for fully successful phases", async () => {
    const { executor } = scriptedExecutor({ b: ["degraded", "degraded"] });
    const succeeded: string[] = [];
    await runPipeline({
      phases: [phase("a"), phase("b", { retries: 2 })],
      executor,
      maxRetries: 2,
      hooks: { onPhaseSuccess: (s) => succeeded.push(s.name) },
    });
    expect(succeeded).toEqual(["a"]);
  });

  it("invokes onRetry between attempts", async () => {
    const { executor } = scriptedExecutor({ a: ["failed", "success"] });
    const retries: Array<{ attempt: number; max: number }> = [];
    await runPipeline({
      phases: [phase("a")],
      executor,
      maxRetries: 3,
      hooks: { onRetry: (_s, attempt, max) => retries.push({ attempt, max }) },
    });
    expect(retries).toEqual([{ attempt: 1, max: 3 }]);
  });
});

describe("selectActivePhases", () => {
  const pipeline = [
    phase("plan"),
    phase("scaffold"),
    phase("build_loop", { buildPhase: true }),
    phase("vega_build_loop", { buildPhase: true, requiresPlatform: "firetv-vega" }),
    phase("visual_qa_loop", { buildPhase: true }),
  ];

  it("filters build phases with generateOnly", () => {
    const { active } = selectActivePhases(pipeline, { platforms: ["web"], generateOnly: true });
    expect(active.map((p) => p.name)).toEqual(["plan", "scaffold"]);
  });

  it("filters platform-gated phases", () => {
    const { active } = selectActivePhases(pipeline, { platforms: ["androidtv"] });
    expect(active.map((p) => p.name)).not.toContain("vega_build_loop");

    const { active: withVega } = selectActivePhases(pipeline, { platforms: ["firetv-vega"] });
    expect(withVega.map((p) => p.name)).toContain("vega_build_loop");
  });

  it("marks phases before fromPhase as completed", () => {
    const { active, completed } = selectActivePhases(pipeline, {
      platforms: ["web"],
      fromPhase: "build_loop",
    });
    expect([...completed]).toEqual(["plan", "scaffold"]);
    expect(active.map((p) => p.name)).toContain("build_loop");
  });

  it("treats resumed phases as completed, filtered to the active pipeline", () => {
    const { completed } = selectActivePhases(pipeline, {
      platforms: ["web"],
      resumedPhases: new Set(["plan", "scaffold", "vega_build_loop"]),
    });
    // vega_build_loop isn't active for web-only — a stale checkpoint entry
    // must not leak into the completed set.
    expect([...completed].sort()).toEqual(["plan", "scaffold"]);
  });

  it("fromPhase overrides resumed phases: later checkpointed phases get redone", () => {
    const { completed } = selectActivePhases(pipeline, {
      platforms: ["web"],
      fromPhase: "scaffold",
      resumedPhases: new Set(["plan", "scaffold", "build_loop", "visual_qa_loop"]),
    });
    expect([...completed]).toEqual(["plan"]);
  });

  it("throws a helpful error for an unknown fromPhase", () => {
    expect(() =>
      selectActivePhases(pipeline, { platforms: ["web"], fromPhase: "nope" })
    ).toThrow(/not in the active pipeline/);
  });
});
