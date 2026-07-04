import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const ROOT = resolve("../..");
const CLI = join(process.cwd(), "node_modules", ".bin", "tsx");

describe("CLI JSON contract", () => {
  it("prints plan output as one schema-versioned JSON object", () => {
    const result = runCli(["src/index.ts", "claude-run", "--example", "changelog-site", "--plan", "--json"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("Using harness config:");
    const payload = parseJson(result.stdout);
    expect(payload.schemaVersion).toBe(1);
    expect(payload.command).toBe("plan");
    expect(payload.phases).toEqual(expect.any(Array));
    expect(result.stdout).not.toContain("Using harness config:");
  });

  it("prints input failures as JSON errors with hints", () => {
    const result = runCli(["src/index.ts", "claude-run", "--example", "missing-example", "--plan", "--json"]);

    expect(result.status).toBe(1);
    const payload = parseJson(result.stdout);
    expect(payload.schemaVersion).toBe(1);
    expect(payload.error).toMatchObject({
      code: "example_not_found",
      hint: expect.any(String),
    });
  });

  it("prints environment failures as JSON errors with exit code 3", () => {
    const result = runCli(
      ["src/index.ts", "run", "--example", "changelog-site", "--json"],
      { ANTHROPIC_API_KEY: "", OPENROUTER_API_KEY: "", OPENAI_API_KEY: "", AWS_PROFILE: "", AWS_ACCESS_KEY_ID: "" }
    );

    expect(result.status).toBe(3);
    const payload = parseJson(result.stdout);
    expect(payload.error).toMatchObject({
      code: "missing_api_credentials",
      hint: expect.stringContaining("ANTHROPIC_API_KEY"),
    });
  });

  it("prints replay as parseable NDJSON events", () => {
    const fixture = join(ROOT, "packages", "mini-harness", "fixtures", "demo-recording.json");
    const result = runCli(["src/index.ts", "replay", fixture, "--json", "--speed", "100"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const events = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
    expect(events.every((event) => event.schemaVersion === 1)).toBe(true);
    expect(events.map((event) => event.event)).toContain("phase_start");
    expect(events.map((event) => event.event)).toContain("phase_complete");
    expect(events.at(-1)).toMatchObject({ event: "run_complete", status: "success" });
  });

  it("prints doctor output as one schema-versioned JSON object", () => {
    const result = runCli(["src/index.ts", "doctor", "--json"]);

    expect([0, 3]).toContain(result.status);
    const payload = parseJson(result.stdout);
    expect(payload.schemaVersion).toBe(1);
    expect(payload.command).toBe("doctor");
    expect(payload.results).toEqual(expect.any(Array));
    expect(result.stdout).not.toContain("Pre-flight Check");
  });
});

function runCli(args: string[], env: Record<string, string> = {}) {
  return spawnSync(CLI, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf-8",
  });
}

function parseJson(stdout: string): Record<string, any> {
  const lines = stdout.trim().split("\n").filter(Boolean);
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]);
}
