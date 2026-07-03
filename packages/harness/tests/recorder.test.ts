import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { costFromResponse, ReplayClient, type RecordedTurn } from "../src/recorder.js";

describe("ReplayClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("summarizes phases, tokens, and stored stream-json costs", () => {
    const recordingPath = writeRecording([
      turn("plan", "2026-07-03T12:00:00.000Z", 10, 5, 0.01),
      turn("branding", "2026-07-03T12:00:01.000Z", 20, 7, 0.02),
      turn("branding", "2026-07-03T12:00:02.000Z", 2, 3, 0.03),
    ]);

    const client = new ReplayClient(recordingPath);

    expect(client.total).toBe(3);
    expect(client.phases).toEqual(["plan", "branding"]);
    expect(client.totals).toEqual({ tokens: 47, costUsd: 0.06 });
  });

  it("applies the 2s pacing cap before dividing by replay speed", async () => {
    vi.useFakeTimers();
    const recordingPath = writeRecording([
      turn("plan", "2026-07-03T12:00:00.000Z", 1, 1, 0),
      turn("branding", "2026-07-03T12:00:10.000Z", 1, 1, 0),
    ]);
    const client = new ReplayClient(recordingPath, { speed: 10 });

    const first = client.nextTurn();
    await vi.advanceTimersByTimeAsync(49);
    await expect(Promise.race([first.then(() => "done"), Promise.resolve("waiting")])).resolves.toBe("waiting");
    await vi.advanceTimersByTimeAsync(1);
    await expect(first).resolves.toMatchObject({ phase: "plan" });

    const second = client.nextTurn();
    await vi.advanceTimersByTimeAsync(199);
    await expect(Promise.race([second.then(() => "done"), Promise.resolve("waiting")])).resolves.toBe("waiting");
    await vi.advanceTimersByTimeAsync(1);
    await expect(second).resolves.toMatchObject({ phase: "branding" });
  });
});

describe("costFromResponse", () => {
  it("sums total_cost_usd values recursively", () => {
    expect(costFromResponse([
      { type: "assistant" },
      { type: "result", total_cost_usd: 0.1 },
      [{ type: "result", total_cost_usd: 0.2 }],
    ])).toBeCloseTo(0.3);
  });
});

function writeRecording(turns: RecordedTurn[]): string {
  const dir = mkdtempSync(join(tmpdir(), "tv-build-recording-"));
  const recordingPath = join(dir, "recording.json");
  writeFileSync(recordingPath, JSON.stringify(turns, null, 2));
  return recordingPath;
}

function turn(
  phase: string,
  timestamp: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number
): RecordedTurn {
  return {
    timestamp,
    phase,
    request: {
      model: "claude-test",
      system: "test",
      messages: [{ role: "user", content: "test" }],
    },
    response: [{ type: "result", result: "ok", total_cost_usd: costUsd }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}
