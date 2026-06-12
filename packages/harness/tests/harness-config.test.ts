import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_PHASES,
  HarnessConfigSchema,
  loadHarnessConfig,
  mergeHarnessConfig,
} from "../src/harness-config.js";

const TEST_DIR = "/tmp/tv-harness-test-config";

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
});

describe("harness config defaults", () => {
  it("default pipeline matches the documented v1 phase order", () => {
    expect(DEFAULT_PHASES.map((p) => p.name)).toEqual([
      "plan", "scaffold", "branding", "content", "screens",
      "navigation", "verify", "build_loop", "vega_build_loop", "visual_qa_loop",
    ]);
  });

  it("falls back to defaults when no config file exists", () => {
    const { config, source } = loadHarnessConfig({ inputDir: TEST_DIR, cwd: TEST_DIR });
    expect(source).toBe("defaults");
    expect(config.template.repo).toContain("AmazonAppDev");
    expect(config.tokenBudget).toBe(500_000);
    expect(config.phases).toHaveLength(DEFAULT_PHASES.length);
  });

  it("plan is the only abort-on-failure phase by default", () => {
    const aborting = DEFAULT_PHASES.filter((p) => p.abortOnFailure).map((p) => p.name);
    expect(aborting).toEqual(["plan"]);
  });
});

describe("mergeHarnessConfig", () => {
  it("overrides fields of an existing phase by name", () => {
    const user = HarnessConfigSchema.parse({
      phases: [{ name: "branding", skills: ["my-theming"], retries: 2 }],
    });
    const merged = mergeHarnessConfig(user);
    const branding = merged.phases.find((p) => p.name === "branding")!;

    expect(branding.skills).toEqual(["my-theming"]);
    expect(branding.retries).toBe(2);
    // untouched fields keep their defaults
    expect(branding.prompt).toBe("branding");
    expect(branding.verify.length).toBeGreaterThan(0);
  });

  it("appends unknown phases at the end", () => {
    const user = HarnessConfigSchema.parse({
      phases: [{ name: "lint", prompt: "lint" }],
    });
    const merged = mergeHarnessConfig(user);
    expect(merged.phases[merged.phases.length - 1].name).toBe("lint");
  });

  it("inserts new phases after the named phase with insertAfter", () => {
    const user = HarnessConfigSchema.parse({
      phases: [{ name: "analytics", prompt: "analytics", insertAfter: "content" }],
    });
    const merged = mergeHarnessConfig(user);
    const names = merged.phases.map((p) => p.name);
    expect(names.indexOf("analytics")).toBe(names.indexOf("content") + 1);
  });

  it("does not mutate the default pipeline across merges", () => {
    const user = HarnessConfigSchema.parse({
      phases: [{ name: "branding", skills: ["x"] }],
    });
    mergeHarnessConfig(user);
    const fresh = mergeHarnessConfig(HarnessConfigSchema.parse({}));
    expect(fresh.phases.find((p) => p.name === "branding")!.skills).toContain("theming");
  });
});

describe("loadHarnessConfig", () => {
  it("loads a config file from the input dir and applies template/model overrides", () => {
    writeFileSync(
      join(TEST_DIR, "harness.config.json"),
      JSON.stringify({
        template: { repo: "https://github.com/me/my-template.git", branch: "tv" },
        models: { plan: "claude-opus-4-6", execution: "claude-haiku-4-5-20251001" },
        tokenBudget: 100_000,
        phases: [{ name: "verify", verify: [{ type: "tsc" }] }],
      })
    );

    const { config, source } = loadHarnessConfig({ inputDir: TEST_DIR, cwd: "/tmp" });
    expect(source).toContain("harness.config.json");
    expect(config.template.repo).toBe("https://github.com/me/my-template.git");
    expect(config.template.branch).toBe("tv");
    expect(config.models.execution).toBe("claude-haiku-4-5-20251001");
    expect(config.tokenBudget).toBe(100_000);
    expect(config.phases.find((p) => p.name === "verify")!.verify).toEqual([{ type: "tsc" }]);
  });

  it("throws when an explicit config path does not exist", () => {
    expect(() =>
      loadHarnessConfig({ explicitPath: join(TEST_DIR, "missing.json"), cwd: TEST_DIR })
    ).toThrow(/not found/);
  });

  it("rejects malformed configs with a Zod error", () => {
    writeFileSync(
      join(TEST_DIR, "harness.config.json"),
      JSON.stringify({ phases: [{ name: "x", verify: [{ type: "bogus" }] }] })
    );
    expect(() => loadHarnessConfig({ inputDir: TEST_DIR, cwd: "/tmp" })).toThrow();
  });
});
