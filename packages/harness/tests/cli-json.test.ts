import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

  it("rejects invalid max-cost values as JSON input errors", () => {
    const result = runCli(["src/index.ts", "claude-run", "--example", "changelog-site", "--plan", "--json", "--max-cost", "nope"]);

    expect(result.status).toBe(1);
    const payload = parseJson(result.stdout);
    expect(payload.error).toMatchObject({
      code: "invalid_max_cost",
      hint: expect.stringContaining("--max-cost"),
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

  it("lists available schemas as one schema-versioned JSON object", () => {
    const result = runCli(["src/index.ts", "schema", "--json"]);

    expect(result.status).toBe(0);
    const payload = parseJson(result.stdout);
    expect(payload).toMatchObject({
      schemaVersion: 1,
      command: "schema",
      schemas: expect.arrayContaining([
        expect.objectContaining({ name: "content", file: "content.json" }),
        expect.objectContaining({ name: "config", file: "harness.config.json" }),
      ]),
    });
  });

  it("prints JSON Schema for a named input schema", () => {
    const result = runCli(["src/index.ts", "schema", "content", "--json"]);

    expect(result.status).toBe(0);
    const payload = parseJson(result.stdout);
    expect(payload).toMatchObject({
      schemaVersion: 1,
      command: "schema",
      name: "content",
      file: "content.json",
    });
    expect(payload.schema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        title: expect.objectContaining({ type: "string", description: expect.any(String) }),
        videos: expect.objectContaining({ type: "array", description: expect.any(String) }),
      },
      required: expect.arrayContaining(["title", "description", "categories", "videos", "featured"]),
    });
  });

  it("prints validate output as JSON with warnings and zero exit", () => {
    const result = runCli(["src/index.ts", "validate", "../../examples/changelog-site", "--json"]);

    expect(result.status).toBe(0);
    const payload = parseJson(result.stdout);
    expect(payload).toMatchObject({
      schemaVersion: 1,
      command: "validate",
      errors: [],
      warnings: expect.any(Array),
    });
  });

  it("prints validate errors as JSON and exits 1", () => {
    const dir = mkdtempSync(join(tmpdir(), "tv-build-cli-validate-"));
    try {
      const result = runCli(["src/index.ts", "validate", dir, "--json"]);

      expect(result.status).toBe(1);
      const payload = parseJson(result.stdout);
      expect(payload).toMatchObject({
        schemaVersion: 1,
        command: "validate",
        errors: [expect.objectContaining({ code: "missing_content" })],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("initializes a starter input directory that validates with warnings only", () => {
    const parent = mkdtempSync(join(tmpdir(), "tv-build-cli-init-"));
    const dir = join(parent, "inputs");
    try {
      const result = runCli(["src/index.ts", "init", dir, "--json"]);

      expect(result.status).toBe(0);
      const payload = parseJson(result.stdout);
      expect(payload).toMatchObject({
        schemaVersion: 1,
        command: "init",
        dir,
        errors: [],
      });
      expect(payload.warnings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "sparse_rail" }),
      ]));
      expect(existsSync(join(dir, "content.json"))).toBe(true);
      expect(existsSync(join(dir, "brand.json"))).toBe(true);
      expect(existsSync(join(dir, "prompt.txt"))).toBe(true);

      const validate = runCli(["src/index.ts", "validate", dir, "--json"]);
      expect(validate.status).toBe(0);
      expect(parseJson(validate.stdout)).toMatchObject({ errors: [] });
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("refuses to initialize into a non-empty directory without force", () => {
    const dir = mkdtempSync(join(tmpdir(), "tv-build-cli-init-non-empty-"));
    try {
      writeFileSync(join(dir, "existing.txt"), "keep");
      const result = runCli(["src/index.ts", "init", dir, "--json"]);

      expect(result.status).toBe(1);
      const payload = parseJson(result.stdout);
      expect(payload.error).toMatchObject({
        code: "init_dir_not_empty",
        hint: expect.stringContaining("--force"),
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("can initialize from a bundled example", () => {
    const parent = mkdtempSync(join(tmpdir(), "tv-build-cli-init-example-"));
    const dir = join(parent, "copied");
    try {
      const result = runCli(["src/index.ts", "init", dir, "--from-example", "changelog-site", "--json"]);

      expect(result.status).toBe(0);
      const payload = parseJson(result.stdout);
      expect(payload).toMatchObject({
        schemaVersion: 1,
        command: "init",
        dir,
        errors: [],
      });
      const content = JSON.parse(readFileSync(join(dir, "content.json"), "utf-8"));
      expect(content.title).toBe("Atlas Release Notes");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("prints template check output as one schema-versioned JSON object", () => {
    const dir = mkdtempSync(join(tmpdir(), "tv-build-cli-template-check-"));
    const bin = join(dir, "bin");
    try {
      writeFileSync(join(dir, "placeholder"), "");
      const mkdir = spawnSync("mkdir", ["-p", bin]);
      expect(mkdir.status).toBe(0);
      const git = join(bin, "git");
      writeFileSync(git, [
        "#!/bin/sh",
        "if [ \"$1\" = \"ls-remote\" ]; then",
        "  echo \"5c9dc393fdbc736dc10aa4285b90cf348ff3f846\\tHEAD\"",
        "  exit 0",
        "fi",
        "exit 1",
        "",
      ].join("\n"));
      chmodSync(git, 0o755);

      const result = runCli(["src/index.ts", "templates", "check", "--json"], {
        PATH: `${bin}:${process.env.PATH ?? ""}`,
      });

      expect(result.status).toBe(0);
      const payload = parseJson(result.stdout);
      expect(payload).toMatchObject({
        schemaVersion: 1,
        command: "templates_check",
        templates: expect.arrayContaining([
          expect.objectContaining({
            repo: expect.stringContaining("react-native-multi-tv-app-sample"),
            commit: "5c9dc393fdbc736dc10aa4285b90cf348ff3f846",
          }),
        ]),
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("detaches a run and reports failed status when the child exits early", async () => {
    const detached = runCli(
      ["src/index.ts", "run", "--example", "changelog-site", "--detach", "--yes", "--json"],
      { ANTHROPIC_API_KEY: "", OPENROUTER_API_KEY: "", OPENAI_API_KEY: "", AWS_PROFILE: "", AWS_ACCESS_KEY_ID: "" }
    );

    expect(detached.status).toBe(0);
    const payload = parseJson(detached.stdout);
    expect(payload).toMatchObject({
      schemaVersion: 1,
      command: "detach",
      runId: expect.any(String),
      pid: expect.any(Number),
      out: expect.any(String),
    });

    await sleep(500);
    const status = runCli(["src/index.ts", "status", payload.runId, "--json"]);
    expect(status.status).toBe(2);
    const summary = parseJson(status.stdout);
    expect(summary).toMatchObject({
      command: "status",
      runId: payload.runId,
      state: "failed",
      stalePid: true,
    });
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
