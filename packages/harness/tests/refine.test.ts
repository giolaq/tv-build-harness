import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_HARNESS_CONFIG } from "../src/harness-config.js";
import { createPromptLoader } from "../src/run-context.js";
import {
  buildRefineInstructions,
  buildRefinePlan,
  executeRefine,
  RefineInputError,
  resolveRefineTarget,
} from "../src/refine.js";
import type { AppSpec, HarnessInput } from "../src/types.js";

const ROOT = join(tmpdir(), "tv-build-refine-test");

beforeEach(() => {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(ROOT, { recursive: true });
});

describe("refine", () => {
  it("resolves both runId and appDir targets", () => {
    const fixture = createRunFixture("run-1");

    expect(resolveRefineTarget("run-1", ROOT)).toMatchObject({
      runId: "run-1",
      outDir: fixture.outDir,
      appDir: fixture.appDir,
      source: "runId",
    });

    expect(resolveRefineTarget(fixture.appDir, ROOT)).toMatchObject({
      runId: "run-1",
      outDir: fixture.outDir,
      appDir: fixture.appDir,
      source: "appDir",
    });
  });

  it("prints a key-free refine plan with phase checks and inherited seed", () => {
    createRunFixture("run-2");

    const plan = buildRefinePlan({
      target: "run-2",
      phase: "branding",
      instruction: "warmer palette, larger hero cards",
      rootDir: ROOT,
      skillsDir: join(ROOT, "skills"),
    });

    expect(plan).toMatchObject({
      command: "refine_plan",
      runId: "run-2",
      phase: "branding",
      inferredPhase: false,
      seed: "seed-run-2",
    });
    expect(plan).not.toHaveProperty("maxCostUsd");
    expect(plan.verify.map((check) => check.type)).toContain("grep");
    expect(plan.nonGoal).toContain("does not rewind");
  });

  it("assembles context from the original phase prompt, instruction, and seed", () => {
    const fixture = createRunFixture("run-3");
    const target = resolveRefineTarget("run-3", ROOT);
    const input = harnessInput(fixture.outDir, "run-3");
    const phaseSpec = DEFAULT_HARNESS_CONFIG.phases.find((phase) => phase.name === "branding")!;
    const prompt = buildRefineInstructions({
      phaseSpec,
      instruction: "make the hero warmer",
      target,
      harnessInput: input,
      harness: DEFAULT_HARNESS_CONFIG,
      prompts: createPromptLoader({ ...input, workdir: fixture.outDir }),
    });

    expect(prompt).toContain("## Original Phase Concern");
    expect(prompt).toContain("Transform the app's visual identity");
    expect(prompt).toContain("make the hero warmer");
    expect(prompt).toContain("Creative seed: seed-run-3");
    expect(prompt).toContain("Do not reset, rewind, regenerate the app");
  });

  it("leaves the app tree clean when verification fails", async () => {
    const fixture = createRunFixture("run-4");

    const result = await executeRefine({
      target: "run-4",
      phase: "branding",
      instruction: "make the hero warmer",
      rootDir: ROOT,
      skillsDir: join(ROOT, "skills"),
      executor: async ({ target }) => {
        writeFileSync(join(target.appDir, "broken.txt"), "dirty");
        return {
          result: { phase: "branding", status: "failed", iterations: 1, error: "grep failed" },
          costUsd: 0.02,
        };
      },
    });

    expect(result.status).toBe("failed");
    expect(execSync("git status --porcelain", { cwd: fixture.appDir, encoding: "utf-8" }).trim()).toBe("");
    expect(existsSync(join(fixture.appDir, "broken.txt"))).toBe(false);
  });

  it("commits successful refines with the expected message", async () => {
    const fixture = createRunFixture("run-5");

    const result = await executeRefine({
      target: "run-5",
      phase: "branding",
      instruction: "warmer palette and larger hero cards",
      rootDir: ROOT,
      skillsDir: join(ROOT, "skills"),
      yes: true,
      executor: async ({ target }) => {
        writeFileSync(join(target.appDir, "theme.txt"), "warm");
        return {
          result: { phase: "branding", status: "success", iterations: 1 },
          costUsd: 0.03,
        };
      },
    });

    expect(result.status).toBe("success");
    expect(execSync("git log -1 --pretty=%s", { cwd: fixture.appDir, encoding: "utf-8" }).trim())
      .toBe("refine(branding): warmer palette and larger hero cards");
    expect(readFileSync(join(fixture.outDir, "report.md"), "utf-8")).toContain("refine(branding)");
  });

  it("requires --yes for JSON execution", async () => {
    createRunFixture("run-6");

    await expect(executeRefine({
      target: "run-6",
      phase: "branding",
      instruction: "make it warmer",
      rootDir: ROOT,
      skillsDir: join(ROOT, "skills"),
      json: true,
    })).rejects.toMatchObject({
      code: "confirmation_required",
    });
  });
});

function createRunFixture(runId: string): { outDir: string; appDir: string } {
  const outDir = join(ROOT, "out", runId);
  const appDir = join(outDir, "app");
  mkdirSync(appDir, { recursive: true });
  mkdirSync(join(appDir, ".tv-build"), { recursive: true });
  mkdirSync(join(ROOT, "skills"), { recursive: true });
  writeFileSync(join(appDir, "package.json"), JSON.stringify({ scripts: { test: "true" } }, null, 2));
  writeFileSync(join(outDir, "spec.json"), JSON.stringify(appSpec(runId), null, 2));
  writeFileSync(join(outDir, "input.json"), JSON.stringify({
    ...harnessInput(outDir, runId),
    skillsDir: undefined,
    workdir: undefined,
  }, null, 2));
  writeFileSync(join(outDir, "report.md"), "# Run Report\n");
  writeFileSync(join(appDir, ".tv-build", "run.json"), JSON.stringify({
    runId,
    outDir,
    specPath: join(outDir, "spec.json"),
    creativeSeed: `seed-${runId}`,
  }, null, 2));

  execFileSync("git", ["init"], { cwd: appDir, stdio: ["pipe", "pipe", "pipe"] });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: appDir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: appDir });
  execFileSync("git", ["add", "-A"], { cwd: appDir });
  execFileSync("git", ["commit", "-m", "initial app"], { cwd: appDir, stdio: ["pipe", "pipe", "pipe"] });

  return { outDir, appDir };
}

function appSpec(runId: string): AppSpec {
  return {
    app_name: "Acme Plus",
    creative_seed: `seed-${runId}`,
    theme: { mode: "dark", tokens: {} },
    navigation: { type: "drawer", routes: [{ id: "home", label: "Home" }] },
    screens: [{ id: "home", route: "Home", layout: "hero+rails", sections: [] }],
    components_to_customize: [],
    components_to_add: [],
    data_bindings: [],
    player: { lib: "react-native-video" },
  };
}

function harnessInput(outDir: string, runId: string): HarnessInput {
  return {
    prompt: "Make it editorial.",
    creativeSeed: `seed-${runId}`,
    content: {
      title: "Acme Catalog",
      description: "Demo catalog.",
      categories: [{ id: "featured", name: "Featured", items: ["v1", "v2", "v3"] }],
      videos: [
        video("v1", "One"),
        video("v2", "Two"),
        video("v3", "Three"),
      ],
      featured: ["v1"],
    },
    brand: {
      name: "Acme TV",
      primary_color: "#112233",
      accent_color: "#ffcc66",
      background_color: "#000000",
      font_family: "Inter",
      logo_path: "",
      splash_path: "",
    },
    config: {
      platforms: ["web"],
      max_iterations: 90,
      max_retries_per_phase: 5,
      build_locally: true,
      eas_profile: "preview",
      visual_qa_max_iterations: 3,
      visual_qa_pass_threshold: "normal",
      use_devtools: false,
    },
    design: {
      template: "classic",
      hero_height: 500,
      show_hero: true,
      tile_size: "medium",
      tile_ratio: "16:9",
      spacing: "normal",
      corner_radius: 8,
      rails_per_screen: 4,
      font_scale: 1,
      show_descriptions: true,
      show_duration: true,
      navigation_style: "drawer",
      focus_style: "border+scale",
      animation_speed: "normal",
      surface_style: "gradient",
      card_style: "rounded",
    },
    workdir: outDir,
    skillsDir: join(ROOT, "skills"),
    harness: DEFAULT_HARNESS_CONFIG,
  };
}

function video(id: string, title: string) {
  return {
    id,
    title,
    description: `${title} description.`,
    duration_sec: 600,
    thumbnail_url: `https://placehold.co/640x360/png?text=${title}`,
    stream_url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    stream_type: "hls" as const,
    tags: ["demo"],
  };
}
