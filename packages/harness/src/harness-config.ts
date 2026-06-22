import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

// ─── Verify Checks (declarative phase verification) ─────────────────────────

export const VerifyCheckSchema = z.discriminatedUnion("type", [
  // At least one of the given paths must exist (relative to the app dir).
  z.object({
    type: z.literal("file_exists"),
    path: z.union([z.string(), z.array(z.string())]),
    error: z.string().optional(),
  }),
  // Pattern (supports {{var}} substitution) must grep-match inside `path`.
  z.object({
    type: z.literal("grep"),
    pattern: z.string(),
    path: z.string().default("."),
    error: z.string().optional(),
  }),
  // The app git worktree must have changes (skipped if git isn't initialized).
  z.object({
    type: z.literal("git_dirty"),
    error: z.string().optional(),
  }),
  z.object({ type: z.literal("tsc"), error: z.string().optional() }),
  z.object({ type: z.literal("focus_check"), error: z.string().optional() }),
  // Arbitrary shell command; non-zero exit fails the check.
  z.object({
    type: z.literal("command"),
    run: z.string(),
    timeoutMs: z.number().default(60_000),
    error: z.string().optional(),
  }),
]);

export type VerifyCheck = z.infer<typeof VerifyCheckSchema>;

// ─── Phase Spec ──────────────────────────────────────────────────────────────

export const PhaseSpecSchema = z.object({
  name: z.string(),
  // "agent": prompt-driven Claude phase. "plan" and "visual_qa" are built-in handlers.
  kind: z.enum(["agent", "plan", "visual_qa"]).default("agent"),
  // Prompt file name (without .md) in the prompts directory. Required for kind=agent.
  prompt: z.string().optional(),
  skills: z.array(z.string()).default([]),
  deps: z.array(z.string()).default([]),
  retries: z.number().optional(),
  timeoutMs: z.number().default(600_000),
  model: z.string().optional(),
  // Phase only runs when this platform is targeted.
  requiresPlatform: z.string().optional(),
  // Skipped when running with --generate-only.
  buildPhase: z.boolean().default(false),
  // Phase manages its own iteration; the engine must not retry it externally.
  internalLoop: z.boolean().default(false),
  // A failure here aborts the whole pipeline.
  abortOnFailure: z.boolean().default(false),
  // Working directory for the agent: the run out dir or the app dir.
  cwd: z.enum(["app", "out"]).default("app"),
  verify: z.array(VerifyCheckSchema).default([]),
  // For user-added phases: insert after this default phase instead of appending.
  insertAfter: z.string().optional(),
});

export type PhaseSpec = z.infer<typeof PhaseSpecSchema>;

// ─── Harness Config ──────────────────────────────────────────────────────────

export const TemplateConfigSchema = z.object({
  repo: z.string(),
  branch: z.string().optional(),
});

export const ModelProviderConfigSchema = z.object({
  provider: z.enum(["bedrock", "anthropic", "openrouter", "openai"]).default("anthropic"),
  modelId: z.string(),
  region: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
});

export type ModelProviderConfig = z.infer<typeof ModelProviderConfigSchema>;

export const ModelsConfigSchema = z.object({
  plan: z.string().default("claude-opus-4-6"),
  execution: z.string().default("claude-sonnet-4-6"),
  // Extended provider config for Strands SDK mode
  strandsProvider: ModelProviderConfigSchema.optional(),
});

export const HarnessConfigSchema = z.object({
  template: TemplateConfigSchema.default({
    repo: "https://github.com/AmazonAppDev/react-native-multi-tv-app-sample.git",
  }),
  models: ModelsConfigSchema.default({ plan: "claude-opus-4-6", execution: "claude-sonnet-4-6" }),
  tokenBudget: z.number().default(500_000),
  phases: z.array(PhaseSpecSchema.partial().extend({ name: z.string() })).optional(),
});

export interface HarnessConfig {
  template: z.infer<typeof TemplateConfigSchema>;
  models: z.infer<typeof ModelsConfigSchema>;
  tokenBudget: number;
  phases: PhaseSpec[];
}


// ─── Default Pipeline ────────────────────────────────────────────────────────
// This encodes the built-in TV app pipeline. A harness.config.json can override
// any field of any phase by name, add new phases, or swap the template.

export const DEFAULT_PHASES: PhaseSpec[] = [
  {
    // Plan failures are often transient (rate limits, malformed JSON) — retry
    // twice, then abort: nothing downstream works without an AppSpec.
    name: "plan", kind: "plan", skills: [], deps: [], retries: 2, timeoutMs: 600_000,
    buildPhase: false, internalLoop: false, abortOnFailure: true, cwd: "out", verify: [],
  },
  {
    name: "scaffold", kind: "agent", prompt: "scaffold", skills: ["template-anatomy"],
    deps: ["plan"], timeoutMs: 600_000, buildPhase: false, internalLoop: false,
    abortOnFailure: false, cwd: "out",
    verify: [{ type: "file_exists", path: "package.json", error: "Template not cloned: package.json missing in app dir" }],
  },
  {
    name: "branding", kind: "agent", prompt: "branding",
    skills: ["template-anatomy", "theming", "firetv-leanback"],
    deps: ["scaffold"], timeoutMs: 600_000, buildPhase: false, internalLoop: false,
    abortOnFailure: false, cwd: "app",
    verify: [
      { type: "git_dirty", error: "Branding phase made no file changes — app is still the unmodified template" },
      { type: "grep", pattern: "{{brand.primary_color}}", path: "packages/shared-ui/", error: "Brand primary color {{brand.primary_color}} not found in shared-ui — theme was not applied" },
    ],
  },
  {
    name: "content", kind: "agent", prompt: "content",
    skills: ["template-anatomy", "manifest-wiring"],
    deps: ["scaffold"], timeoutMs: 600_000, buildPhase: false, internalLoop: false,
    abortOnFailure: false, cwd: "app",
    verify: [
      { type: "file_exists", path: ["packages/shared-ui/src/data", "packages/shared-ui/data"], error: "Manifest wiring failed: no data/ directory found in shared-ui" },
      { type: "grep", pattern: "{{content.title}}", path: "packages/shared-ui/", error: "Content title \"{{content.title}}\" not found in shared-ui — content was not injected" },
    ],
  },
  {
    name: "screens", kind: "agent", prompt: "screens",
    skills: ["template-anatomy", "shared-ui-catalog", "10ft-ui"],
    deps: ["branding", "content"], timeoutMs: 600_000, buildPhase: false,
    internalLoop: false, abortOnFailure: false, cwd: "app", verify: [],
  },
  {
    name: "creative_ui", kind: "agent", prompt: "creative_ui",
    skills: ["template-anatomy", "shared-ui-catalog", "10ft-ui", "creative-tv-ui"],
    deps: ["screens"], timeoutMs: 600_000, buildPhase: false, internalLoop: false,
    abortOnFailure: false, cwd: "app",
    verify: [{ type: "tsc" }],
  },
  {
    name: "navigation", kind: "agent", prompt: "navigation",
    skills: ["template-anatomy", "shared-ui-catalog", "spatial-navigation"],
    deps: ["creative_ui"], timeoutMs: 600_000, buildPhase: false, internalLoop: false,
    abortOnFailure: false, cwd: "app", verify: [],
  },
  {
    name: "verify", kind: "agent", prompt: "verify", skills: [],
    deps: ["navigation"], timeoutMs: 600_000, buildPhase: false, internalLoop: false,
    abortOnFailure: false, cwd: "app",
    verify: [{ type: "tsc" }, { type: "focus_check" }],
  },
  {
    name: "build_loop", kind: "agent", prompt: "build_loop", skills: [],
    deps: ["verify"], timeoutMs: 900_000, buildPhase: true, internalLoop: false,
    abortOnFailure: false, cwd: "app", verify: [],
  },
  {
    name: "vega_build_loop", kind: "agent", prompt: "vega_build_loop", skills: ["vega-sdk"],
    deps: ["verify"], timeoutMs: 900_000, requiresPlatform: "firetv-vega",
    buildPhase: true, internalLoop: false, abortOnFailure: false, cwd: "app", verify: [],
  },
  {
    name: "visual_qa_loop", kind: "visual_qa",
    skills: ["10ft-ui", "theming", "spatial-navigation"],
    deps: ["build_loop"], timeoutMs: 600_000, buildPhase: true, internalLoop: true,
    abortOnFailure: false, cwd: "app", verify: [],
  },
  {
    name: "android_test_loop", kind: "agent", prompt: "android_test_loop",
    skills: ["android-tv-testing"],
    deps: ["build_loop"], timeoutMs: 1_800_000, requiresPlatform: "androidtv",
    buildPhase: true, internalLoop: true, abortOnFailure: false, cwd: "app", verify: [],
  },
];

// Default skills per phase, kept for API-mode back-compat (SkillLibrary.loadForPhase).
export const DEFAULT_PHASE_SKILLS: Record<string, string[]> = Object.fromEntries(
  DEFAULT_PHASES.map((p) => [p.name, p.skills])
);
// Phases known to the type system but not in the default pipeline.
Object.assign(DEFAULT_PHASE_SKILLS, {
  prebuild: ["firetv-leanback"],
  visual_correctness: ["10ft-ui", "theming"],
  visual_smoke_test: ["10ft-ui"],
  eas_build: ["eas-build"],
  package: [],
});

export const DEFAULT_HARNESS_CONFIG: HarnessConfig = {
  template: { repo: "https://github.com/AmazonAppDev/react-native-multi-tv-app-sample.git" },
  models: { plan: "claude-opus-4-6", execution: "claude-sonnet-4-6" },
  tokenBudget: 500_000,
  phases: DEFAULT_PHASES,
};

// ─── Loading & merging ───────────────────────────────────────────────────────

export function mergeHarnessConfig(user: z.infer<typeof HarnessConfigSchema>): HarnessConfig {
  const phases: PhaseSpec[] = DEFAULT_PHASES.map((p) => ({ ...p, verify: [...p.verify] }));

  for (const override of user.phases ?? []) {
    const existing = phases.findIndex((p) => p.name === override.name);
    if (existing >= 0) {
      const defined = Object.fromEntries(
        Object.entries(override).filter(([, v]) => v !== undefined)
      );
      phases[existing] = { ...phases[existing], ...defined };
    } else {
      const full = PhaseSpecSchema.parse(override);
      const after = full.insertAfter
        ? phases.findIndex((p) => p.name === full.insertAfter)
        : -1;
      if (after >= 0) phases.splice(after + 1, 0, full);
      else phases.push(full);
    }
  }

  return {
    template: user.template,
    models: user.models,
    tokenBudget: user.tokenBudget,
    phases,
  };
}

/**
 * Loads harness.config.json from (in order): an explicit path, the input dir,
 * or the current working directory. Falls back to the built-in defaults.
 */
export function loadHarnessConfig(opts: {
  explicitPath?: string;
  inputDir?: string;
  cwd?: string;
}): { config: HarnessConfig; source: string } {
  const candidates = [
    opts.explicitPath,
    opts.inputDir ? join(opts.inputDir, "harness.config.json") : undefined,
    join(opts.cwd ?? process.cwd(), "harness.config.json"),
  ].filter((p): p is string => Boolean(p));

  for (const path of candidates) {
    if (!existsSync(path)) {
      if (path === opts.explicitPath) {
        throw new Error(`Config file not found: ${path}`);
      }
      continue;
    }
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    const parsed = HarnessConfigSchema.parse(raw);
    return { config: mergeHarnessConfig(parsed), source: path };
  }

  return { config: mergeHarnessConfig(HarnessConfigSchema.parse({})), source: "defaults" };
}
