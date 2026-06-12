import { describe, it, expect, beforeEach } from "vitest";
import { rmSync, readFileSync } from "node:fs";
import { RunLog } from "../src/run-log.js";

const TEST_LOG_PATH = "/tmp/tv-harness-test-run.log";

beforeEach(() => {
  rmSync(TEST_LOG_PATH, { force: true });
});

describe("RunLog", () => {
  it("creates log file on construction", () => {
    new RunLog(TEST_LOG_PATH);
    const content = readFileSync(TEST_LOG_PATH, "utf-8");
    expect(content).toBe("");
  });

  it("appends NDJSON entries", () => {
    const log = new RunLog(TEST_LOG_PATH);
    log.phaseStart("plan", 1);
    log.phaseEnd("plan", 1, "done");

    const lines = readFileSync(TEST_LOG_PATH, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);

    const entry1 = JSON.parse(lines[0]);
    expect(entry1.event).toBe("phase_start");
    expect(entry1.phase).toBe("plan");

    const entry2 = JSON.parse(lines[1]);
    expect(entry2.event).toBe("phase_end");
    expect(entry2.message).toBe("done");
  });

  it("logs tool calls with input", () => {
    const log = new RunLog(TEST_LOG_PATH);
    log.toolCall("scaffold", 1, "scaffold", { target_dir: "/tmp" });

    const lines = readFileSync(TEST_LOG_PATH, "utf-8").trim().split("\n");
    const entry = JSON.parse(lines[0]);
    expect(entry.tool).toBe("scaffold");
    expect(entry.input).toEqual({ target_dir: "/tmp" });
  });

  it("getLastNLines returns correct subset", () => {
    const log = new RunLog(TEST_LOG_PATH);
    log.phaseStart("plan", 1);
    log.phaseStart("scaffold", 2);
    log.phaseStart("branding", 3);

    const last2 = log.getLastNLines(2);
    expect(last2).toHaveLength(2);
    expect(last2[0].phase).toBe("scaffold");
    expect(last2[1].phase).toBe("branding");
  });

  it("includes ISO timestamp on every entry", () => {
    const log = new RunLog(TEST_LOG_PATH);
    log.error("plan", 1, "something broke");

    const entries = log.getEntries();
    expect(entries[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
