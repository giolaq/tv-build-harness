import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abortRun, initRunStatus, summarizeRun, updateRunStatus } from "../src/status.js";

describe("detached run status", () => {
  it("summarizes status, checkpoint, and log tail", () => {
    const root = mkdtempSync(join(tmpdir(), "tv-build-status-"));
    try {
      const outDir = join(root, "out", "run-1");
      initRunStatus(outDir, { runId: "run-1", pid: process.pid, budget: 5 });
      updateRunStatus(outDir, { state: "running", currentPhase: "branding", costSoFar: 1.25 });
      writeFileSync(join(outDir, "checkpoint.json"), JSON.stringify({
        runId: "run-1",
        completedPhases: ["plan"],
        updatedAt: new Date().toISOString(),
      }));
      writeFileSync(join(outDir, "run.log"), "{\"event\":\"phase_start\",\"phase\":\"branding\"}\n");

      const summary = summarizeRun(root, "run-1");

      expect(summary).toMatchObject({
        runId: "run-1",
        state: "running",
        currentPhase: "branding",
        phasesComplete: ["plan"],
        costSoFar: 1.25,
        budget: 5,
      });
      expect(summary?.lastLogLines).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("marks a stale starting pid as failed", () => {
    const root = mkdtempSync(join(tmpdir(), "tv-build-status-stale-"));
    try {
      const outDir = join(root, "out", "run-2");
      initRunStatus(outDir, { runId: "run-2", pid: 99999999 });

      const summary = summarizeRun(root, "run-2");

      expect(summary?.state).toBe("failed");
      expect(summary?.stalePid).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("records abort requests even when the pid is already stale", () => {
    const root = mkdtempSync(join(tmpdir(), "tv-build-status-abort-"));
    try {
      const outDir = join(root, "out", "run-3");
      initRunStatus(outDir, { runId: "run-3", pid: 99999999 });

      const summary = abortRun(root, "run-3");

      expect(summary?.state).toBe("aborted");
      expect(summary?.reason).toBe("user");
      expect(summary?.exitCode).toBe(4);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

