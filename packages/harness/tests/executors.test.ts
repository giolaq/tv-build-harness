import { beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildPhaseInstructions, buildPlanPrompt } from "../src/phase-prompts.js";
import { PromptLoader } from "../src/prompt-loader.js";
import { SkillLibrary } from "../src/skill-library.js";
import { writeRunReport } from "../src/run-report.js";
import { Recorder } from "../src/recorder.js";
import { runPipeline, selectActivePhases } from "../src/pipeline-engine.js";
import { mergeHarnessConfig, type HarnessConfig, type PhaseSpec } from "../src/harness-config.js";
import type { AppSpec, HarnessInput } from "../src/types.js";

const TEST_DIR = join(tmpdir(), "tv-build-executors-test");

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
});

describe("executor characterization", () => {
  it("assembles the plan prompt from brief, content, brand, design, and screen tree", () => {
    const prompts = promptLoader({
      plan: [
        "nav={{navTypeConstraint}}",
        "brief={{brief}}",
        "content={{contentSummary}}",
        "brand={{brandName}} {{primaryColor}} {{accentColor}} {{backgroundColor}}",
        "design={{template}} {{navStyle}} {{heroVisibility}} {{tileSize}}",
        "tree={{screenTreeSection}}",
      ].join("\n"),
    });

    const prompt = buildPlanPrompt({ ...phaseContext(prompts), spec: null });

    expect(prompt).toContain("nav=drawer");
    expect(prompt).toContain("brief=Make it editorial.");
    expect(prompt).toContain("content=1 categories, 1 videos, 1 featured");
    expect(prompt).toContain("brand=Acme TV #112233 #445566 #000000");
    expect(prompt).toContain("design=classic drawer visible large");
    expect(prompt).toContain("SCREEN TREE");
    expect(prompt).toContain("Home screen: Home");
  });

  it("substitutes built-in branding prompt variables from the AppSpec and brand kit", () => {
    const prompts = promptLoader({
      branding: "{{appDir}} {{appName}} {{slug}} {{bundleId}} {{primaryColor}} {{accentColor}} {{backgroundColor}} {{fontFamily}}",
    });

    const prompt = buildPhaseInstructions(phase("branding"), phaseContext(prompts));

    expect(prompt).toContain(`${TEST_DIR}/app`);
    expect(prompt).toContain("Acme Plus");
    expect(prompt).toContain("acme-plus");
    expect(prompt).toContain("com.tvharness.acmeplus");
    expect(prompt).toContain("#112233 #445566 #000000 Inter");
  });

  it("loads custom phase prompts with the generic variable bag", () => {
    const prompts = promptLoader({
      audit: "{{appDir}} {{outDir}} {{appName}} {{contentTitle}} {{platforms}} {{templateRepo}}",
    });

    const prompt = buildPhaseInstructions(phase("audit", { prompt: "audit" }), phaseContext(prompts));

    expect(prompt).toContain(`${TEST_DIR}/app`);
    expect(prompt).toContain(TEST_DIR);
    expect(prompt).toContain("Acme Plus");
    expect(prompt).toContain("Acme Catalog");
    expect(prompt).toContain("androidtv, web");
    expect(prompt).toContain("https://example.com/template.git");
  });

  it("assembles repeatable creative constraints from the run seed", () => {
    const prompts = promptLoader({
      creative_ui: "{{creativeSeed}}",
    });

    const first = buildPhaseInstructions(phase("creative_ui"), phaseContext(prompts, "demo-seed"));
    const second = buildPhaseInstructions(phase("creative_ui"), phaseContext(prompts, "demo-seed"));
    const different = buildPhaseInstructions(phase("creative_ui"), phaseContext(prompts, "other-seed"));

    expect(first).toBe(second);
    expect(first).toContain("creative seed: demo-seed");
    expect(different).not.toBe(first);
  });

  it("loads nested skills by frontmatter name and ignores missing skill names", () => {
    const skillsDir = join(TEST_DIR, "skills");
    mkdirSync(join(skillsDir, "rn-demo"), { recursive: true });
    writeFileSync(
      join(skillsDir, "rn-demo", "SKILL.md"),
      "---\nname: rn-demo\napplies_to: [branding]\n---\n\n# Demo Skill\n\nUse the demo guidance."
    );

    const library = new SkillLibrary(skillsDir);

    expect(library.listSkills("core").map((s) => s.name)).toEqual(["rn-demo"]);
    expect(library.loadSkills(["missing", "rn-demo"])).toHaveLength(1);
    expect(library.loadSkill("rn-demo")).toContain("Use the demo guidance.");
  });

  it("writes a shared run report with phase status, costs, spec summary, and Vega artifacts", () => {
    writeFileSync(join(TEST_DIR, "vega-report.md"), "# Vega Report");
    writeRunReport({
      outDir: TEST_DIR,
      runId: "run-123",
      mode: "claude-run",
      platforms: ["androidtv", "firetv-vega"],
      templateRepo: "https://example.com/template.git",
      tokensUsed: 1500,
      tokenBudget: 3000,
      totalCost: 0.12345,
      phaseResults: new Map([
        ["plan", { phase: "plan", status: "success", iterations: 1 }],
        ["verify", { phase: "verify", status: "failed", iterations: 2, error: "Type error in generated app" }],
      ]),
      phaseCosts: new Map([["plan", 0.01]]),
      spec: appSpec(),
      brand: input().brand,
      creativeSeed: "demo-seed",
    });

    const report = readFileSync(join(TEST_DIR, "report.md"), "utf-8");
    expect(report).toContain("**Run ID:** run-123");
    expect(report).toContain("**Creative seed:** demo-seed");
    expect(report).toContain("| ✓ plan | success | 1 | $0.0100 |");
    expect(report).toContain("Error: Type error in generated app");
    expect(report).toContain("**Result:** 1/2 phases succeeded");
    expect(report).toContain("Brand:** Acme TV (#112233 / #445566)");
    expect(report).toContain("vega-report.md");
  });

  it("persists recordings in the existing RecordedTurn JSON array shape", () => {
    const filePath = join(TEST_DIR, "recording.json");
    const recorder = new Recorder(filePath);
    recorder.record({
      timestamp: "2026-07-03T00:00:00.000Z",
      phase: "branding",
      seed: "demo-seed",
      request: { model: "claude-test", system: "system", messages: [{ role: "user", content: "prompt" }] },
      response: { type: "message", content: "ok" },
      usage: { input_tokens: 11, output_tokens: 7 },
    });
    recorder.save();

    const loaded = Recorder.load(filePath);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].phase).toBe("branding");
    expect(loaded[0].seed).toBe("demo-seed");
    expect(loaded[0].request.messages).toEqual([{ role: "user", content: "prompt" }]);
    expect(loaded[0].usage).toEqual({ input_tokens: 11, output_tokens: 7 });
  });

  it("filters build and platform-specific phases consistently for generate-only runs", () => {
    const phases = [
      phase("plan", { buildPhase: false }),
      phase("build_loop", { buildPhase: true }),
      phase("vega_build_loop", { buildPhase: true, requiresPlatform: "firetv-vega" }),
      phase("web_audit", { buildPhase: false, requiresPlatform: "web" }),
    ];

    const { active } = selectActivePhases(phases, {
      platforms: ["web"],
      generateOnly: true,
    });

    expect(active.map((p) => p.name)).toEqual(["plan", "web_audit"]);
  });

  it("retries failed executor results and emits retry hooks before success", async () => {
    const retries: string[] = [];
    const results = await runPipeline({
      phases: [phase("branding", { retries: 3 })],
      maxRetries: 1,
      executor: async (spec, attempt) => ({
        phase: spec.name,
        status: attempt < 2 ? "failed" : "success",
        iterations: attempt,
        error: attempt < 2 ? "first failure" : undefined,
      }),
      hooks: {
        onRetry: (spec, attempt, maxRetries, result) => {
          retries.push(`${spec.name}:${attempt}/${maxRetries}:${result.error}`);
        },
      },
    });

    expect(retries).toEqual(["branding:1/3:first failure"]);
    expect(results.get("branding")).toEqual({ phase: "branding", status: "success", iterations: 2, error: undefined });
  });
});

function promptLoader(files: Record<string, string>): PromptLoader {
  const dir = join(TEST_DIR, "prompts");
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, `${name}.md`), content);
  }
  return new PromptLoader(dir);
}

function phase(name: string, override: Partial<PhaseSpec> = {}): PhaseSpec {
  return {
    name,
    kind: "agent",
    prompt: name,
    skills: [],
    deps: [],
    timeoutMs: 600_000,
    buildPhase: false,
    internalLoop: false,
    abortOnFailure: false,
    cwd: "app",
    verify: [],
    ...override,
  };
}

function phaseContext(prompts: PromptLoader, creativeSeed = "test-seed"): {
  outDir: string;
  input: HarnessInput;
  spec: AppSpec;
  harness: HarnessConfig;
  prompts: PromptLoader;
  creativeSeed: string;
} {
  return {
    outDir: TEST_DIR,
    input: input(),
    spec: appSpec(),
    harness: mergeHarnessConfig({
      template: { repo: "https://example.com/template.git" },
      models: { plan: "claude-opus-4-6", execution: "claude-sonnet-4-6" },
      tokenBudget: 500_000,
      vega: {
        ttff_ms_max: 1500,
        ttfd_ms_max: 3000,
        max_hot_function_percent: 20,
        max_js_frame_drop_percent: 2,
        require_builder_tools: false,
      },
    }),
    prompts,
    creativeSeed,
  };
}

function input(): HarnessInput {
  return {
    prompt: "Make it editorial.",
    creativeSeed: "test-seed",
    content: {
      title: "Acme Catalog",
      description: "A test catalog",
      categories: [{ id: "featured", name: "Featured", items: ["v1"] }],
      videos: [{
        id: "v1",
        title: "Pilot",
        description: "The first episode",
        duration_sec: 120,
        thumbnail_url: "https://example.com/thumb.jpg",
        stream_url: "https://example.com/stream.m3u8",
        stream_type: "hls",
        tags: ["test"],
      }],
      featured: ["v1"],
    },
    brand: {
      name: "Acme TV",
      primary_color: "#112233",
      accent_color: "#445566",
      background_color: "#000000",
      font_family: "Inter",
      logo_path: "",
      splash_path: "",
    },
    config: {
      platforms: ["androidtv", "web"],
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
      tile_size: "large",
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
    screenTree: {
      navigation_type: "drawer",
      home: { id: "home", name: "Home", layout: "hero+rails" },
      screens: [{ id: "search", name: "Search", layout: "search", icon: "search" }],
    },
    workdir: TEST_DIR,
    skillsDir: join(TEST_DIR, "skills"),
  };
}

function appSpec(): AppSpec {
  return {
    app_name: "Acme Plus",
    theme: { mode: "dark", tokens: {} },
    navigation: {
      type: "drawer",
      routes: [
        { id: "home", label: "Home", icon: "home" },
        { id: "search", label: "Search", icon: "search" },
      ],
    },
    screens: [
      { id: "home", route: "home", layout: "hero+rails", sections: [] },
      { id: "search", route: "search", layout: "search", sections: [] },
    ],
    components_to_customize: [],
    components_to_add: [],
    data_bindings: [],
    player: { lib: "react-native-video" },
  };
}
