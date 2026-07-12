import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HarnessRunError, classifyHarnessExit, runHarness } from "../../src/harnessClient.js";

const ROOT = join(tmpdir(), "tv-build-verification-harness-client");
const FAKE = resolve("tests", "fixtures", "fake-harness.mjs");
const FAKE_COMMAND = `${process.execPath} ${FAKE} claude-run`;

beforeEach(() => {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(ROOT, { recursive: true });
});

describe("harness client", () => {
  it("parses harness NDJSON and extracts run metadata", async () => {
    const input = inputDir("basic");

    const result = await runHarness(input, {
      command: FAKE_COMMAND,
      seed: "fixed-seed",
      maxCostUsd: 2,
      extraArgs: ["--fake-run-id", "run-123", "--fake-cost", "0.42"],
    });

    expect(result).toMatchObject({
      runId: "run-123",
      seed: "fixed-seed",
      costUsd: 0.42,
      appPath: expect.stringContaining(join("out", "run-123", "app")),
      phaseTimings: [expect.objectContaining({ phase: "branding" })],
    });
  });

  it("keeps input directories with spaces as one argv entry", async () => {
    const input = inputDir("path with spaces");

    const result = await runHarness(input, {
      command: FAKE_COMMAND,
      extraArgs: ["--fake-run-id", "space-run"],
    });

    expect(result.runId).toBe("space-run");
  });

  it.each([
    [2, "harness_failure"],
    [3, "infra_error"],
    [4, "budget_abort"],
    [9, "infra_error"],
  ] as const)("classifies exit code %s as %s", async (exitCode, outcome) => {
    const input = inputDir(`exit-${exitCode}`);

    await expect(runHarness(input, {
      command: FAKE_COMMAND,
      extraArgs: ["--fake-exit-code", String(exitCode), "--fake-run-id", `exit-${exitCode}`],
    })).rejects.toMatchObject({
      outcome,
      details: expect.objectContaining({ exitCode }),
    });
  });

  it("fails loudly on schemaVersion mismatch", async () => {
    const input = inputDir("schema-mismatch");

    await expect(runHarness(input, {
      command: FAKE_COMMAND,
      extraArgs: ["--fake-schema-version", "2", "--fake-schema-only"],
    })).rejects.toThrow(/schemaVersion/);
  });

  it("allows non-NDJSON text on stderr while parsing stdout events", async () => {
    const input = inputDir("stderr-noise");

    const result = await runHarness(input, {
      command: FAKE_COMMAND,
      extraArgs: ["--fake-stderr", "--fake-run-id", "stderr-run"],
    });

    expect(result.runId).toBe("stderr-run");
  });

  it("keeps text fallback only for exitless failures", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(classifyHarnessExit(null, "SIGTERM", "rate_limit")).toBe("infra_error");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("using text fallback"));
    } finally {
      warn.mockRestore();
    }
  });
});

function inputDir(name: string): string {
  const dir = join(ROOT, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}
