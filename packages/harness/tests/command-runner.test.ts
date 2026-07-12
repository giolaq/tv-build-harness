import { describe, expect, it } from "vitest";
import { NodeCommandRunner } from "../src/process/command-runner.js";

const runner = new NodeCommandRunner();

describe("command runner", () => {
  it("preserves argument boundaries and redacts output", async () => {
    const result = await runner.run({
      command: process.execPath,
      args: ["-e", "process.stdout.write(process.argv[1])", "path with spaces secret-value"],
      timeoutMs: 2_000,
      redact: ["secret-value"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("path with spaces [REDACTED]");
  });

  it("bounds output", async () => {
    const result = await runner.run({
      command: process.execPath,
      args: ["-e", "process.stdout.write('x'.repeat(1000))"],
      timeoutMs: 2_000,
      maxOutputBytes: 32,
    });
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(32);
  });

  it("terminates timed-out commands", async () => {
    const result = await runner.run({
      command: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      timeoutMs: 50,
    });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });
});
