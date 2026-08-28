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
      initRunStatus(outDir, { runId: "run-1", pid: process.pid });
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
      });
      expect(summary).not.toHaveProperty("budget");
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

  it("marks an early child error log as failed even when the pid still appears alive", () => {
    const root = mkdtempSync(join(tmpdir(), "tv-build-status-log-failed-"));
    try {
      const outDir = join(root, "out", "run-log-failed");
      initRunStatus(outDir, { runId: "run-log-failed", pid: process.pid });
      writeFileSync(join(outDir, "run.log"), JSON.stringify({
        schemaVersion: 1,
        error: {
          code: "missing_api_credentials",
          message: "No API credentials found for API mode.",
          hint: "Set credentials.",
        },
      }) + "\n");

      const summary = summarizeRun(root, "run-log-failed");

      expect(summary?.state).toBe("failed");
      expect(summary?.exitCode).toBe(2);
      expect(summary?.reason).toBe("child_exit");
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
