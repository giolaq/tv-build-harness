import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

// ─── Verify Checks (declarative phase verification) ─────────────────────────

export const VerifyCheckSchema = z.discriminatedUnion("type", [
  // At least one of the given paths must exist (relative to the app dir).
  z.object({
    type: z.literal("file_exists").describe("Check kind."),
    path: z.union([z.string(), z.array(z.string())]).describe("Required path or fallback paths relative to the app dir."),
    error: z.string().optional().describe("Custom failure message."),
  }),
  // Pattern (supports {{var}} substitution) must grep-match inside `path`.
  z.object({
    type: z.literal("grep").describe("Check kind."),
    pattern: z.string().describe("String pattern after template substitution."),
    path: z.string().default(".").describe("File or directory to search relative to the app dir."),
    error: z.string().optional().describe("Custom failure message."),
  }),
  // The app git worktree must have changes (skipped if git isn't initialized).
  z.object({
    type: z.literal("git_dirty").describe("Check kind."),
    error: z.string().optional().describe("Custom failure message."),
  }),
  z.object({ type: z.literal("tsc").describe("Check kind."), error: z.string().optional().describe("Custom failure message.") }),
  z.object({ type: z.literal("focus_check").describe("Check kind."), error: z.string().optional().describe("Custom failure message.") }),
  z.object({
    type: z.literal("forbidden_import").describe("Check kind."),
    pattern: z.string().describe("Import pattern that must not appear."),
    path: z.string().default(".").describe("File or directory to search relative to the app dir."),
    error: z.string().optional().describe("Custom failure message."),
  }),
  // Arbitrary shell command; non-zero exit fails the check.
  z.object({
    type: z.literal("command").describe("Check kind."),
    run: z.string().describe("Shell command to run."),
    timeoutMs: z.number().default(60_000).describe("Command timeout in milliseconds."),
    error: z.string().optional().describe("Custom failure message."),
  }),
]);

export type VerifyCheck = z.infer<typeof VerifyCheckSchema>;

// ─── Phase Spec ──────────────────────────────────────────────────────────────

export const PhaseSpecSchema = z.object({
  name: z.string().describe("Phase name."),
  // "agent": prompt-driven Claude phase. "plan" and "visual_qa" are built-in handlers.
  kind: z.enum(["agent", "plan", "visual_qa"]).default("agent").describe("Executor behavior for the phase."),
  // Prompt file name (without .md) in the prompts directory. Required for kind=agent.
  prompt: z.string().optional().describe("Prompt file name without .md."),
  skills: z.array(z.string()).default([]).describe("Skill names loaded for this phase."),
  deps: z.array(z.string()).default([]).describe("Phase names that must complete first."),
  retries: z.number().optional().describe("Phase-specific retry count."),
  timeoutMs: z.number().default(600_000).describe("Phase timeout in milliseconds."),
  model: z.string().optional().describe("Claude model override for this phase."),
  // Phase only runs when this platform is targeted.
  requiresPlatform: z.string().optional().describe("Only run when this platform is targeted."),
  // Skipped when running with --generate-only.
  buildPhase: z.boolean().default(false).describe("Skip this phase when --generate-only is used."),
  // Phase manages its own iteration; the engine must not retry it externally.
  internalLoop: z.boolean().default(false).describe("Phase manages its own retries/iterations."),
  // A failure here aborts the whole pipeline.
  abortOnFailure: z.boolean().default(false).describe("Abort the pipeline if this phase ultimately fails."),
  // Working directory for the agent: the run out dir or the app dir.
  cwd: z.enum(["app", "out"]).default("app").describe("Working directory for the agent."),
  verify: z.array(VerifyCheckSchema).default([]).describe("Verification checks after the phase."),
  // For user-added phases: insert after this default phase instead of appending.
  insertAfter: z.string().optional().describe("Insert a new phase after this existing phase."),
});

export type PhaseSpec = z.infer<typeof PhaseSpecSchema>;

export const PhaseOverrideSchema = z.object({
  name: z.string().describe("Phase name to override or add."),
  kind: z.enum(["agent", "plan", "visual_qa"]).optional().describe("Executor behavior for the phase."),
  prompt: z.string().optional().describe("Prompt file name without .md."),
  skills: z.array(z.string()).optional().describe("Skill names loaded for this phase."),
  deps: z.array(z.string()).optional().describe("Phase names that must complete first."),
  retries: z.number().optional().describe("Phase-specific retry count."),
  timeoutMs: z.number().optional().describe("Phase timeout in milliseconds."),
  model: z.string().optional().describe("Claude model override for this phase."),
  requiresPlatform: z.string().optional().describe("Only run when this platform is targeted."),
  buildPhase: z.boolean().optional().describe("Skip this phase when --generate-only is used."),
  internalLoop: z.boolean().optional().describe("Phase manages its own retries/iterations."),
  abortOnFailure: z.boolean().optional().describe("Abort the pipeline if this phase ultimately fails."),
  cwd: z.enum(["app", "out"]).optional().describe("Working directory for the agent."),
  verify: z.array(VerifyCheckSchema).optional().describe("Verification checks after the phase."),
  insertAfter: z.string().optional().describe("Insert a new phase after this existing phase."),
});

// ─── Harness Config ──────────────────────────────────────────────────────────

export const TemplateConfigSchema = z.object({
  repo: z.string().describe("Git repository for the app template."),
  commit: z.string().regex(/^[0-9a-f]{40}$/i, "Template commit must be a 40-character git SHA.").describe("Pinned template commit SHA."),
}).catchall(z.unknown()).superRefine((value, ctx) => {
  if ("branch" in value) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["branch"],
      message: "Template branch refs are not allowed. Pin template.commit to a 40-character SHA.",
    });
  }
});

export const ModelProviderConfigSchema = z.object({
  provider: z.enum(["bedrock", "anthropic", "openrouter", "openai"]).default("anthropic").describe("Model provider."),
  modelId: z.string().describe("Provider-specific model id."),
  region: z.string().optional().describe("Cloud region for providers that need one."),
  temperature: z.number().optional().describe("Optional sampling temperature."),
  maxTokens: z.number().optional().describe("Optional maximum output token count."),
});

export type ModelProviderConfig = z.infer<typeof ModelProviderConfigSchema>;

export const ModelsConfigSchema = z.object({
  plan: z.string().default("claude-opus-4-6").describe("Model for the planning phase."),
  execution: z.string().default("claude-sonnet-4-6").describe("Default model for execution phases."),
  strandsProvider: ModelProviderConfigSchema.optional().describe("Provider config for Strands/API mode."),
  phaseModels: z.record(z.string(), ModelProviderConfigSchema).optional().describe("Per-phase provider overrides."),
});

export const VegaConfigSchema = z.object({
  ttff_ms_max: z.number().default(1500).describe("Maximum time to first frame in milliseconds."),
  ttfd_ms_max: z.number().default(3000).describe("Maximum time to first decode in milliseconds."),
  max_hot_function_percent: z.number().default(20).describe("Maximum allowed hot function percentage."),
  max_js_frame_drop_percent: z.number().default(2).describe("Maximum allowed JavaScript frame drop percentage."),
  require_builder_tools: z.boolean().default(false).describe("Fail setup if Amazon Devices Builder Tools are missing."),
});

export const DEFAULT_VEGA_CONFIG = {
  ttff_ms_max: 1500,
  ttfd_ms_max: 3000,
  max_hot_function_percent: 20,
  max_js_frame_drop_percent: 2,
  require_builder_tools: false,
};

export const HarnessConfigSchema = z.object({
  template: TemplateConfigSchema.default({
    repo: "https://github.com/AmazonAppDev/react-native-multi-tv-app-sample.git",
    commit: "5c9dc393fdbc736dc10aa4285b90cf348ff3f846",
  }).describe("Template repository configuration."),
  models: ModelsConfigSchema.default({ plan: "claude-opus-4-6", execution: "claude-sonnet-4-6" }).describe("Model selection."),
  vega: VegaConfigSchema.default(DEFAULT_VEGA_CONFIG).describe("Vega build and performance thresholds."),
  tokenBudget: z.number().default(500_000).describe("Maximum token budget for a run."),
  maxCostUsd: z.number().optional().describe("Optional maximum run cost in US dollars."),
  phases: z.array(PhaseOverrideSchema).optional().describe("Phase overrides or additional phases."),
});

export interface HarnessConfig {
  template: z.infer<typeof TemplateConfigSchema>;
  models: z.infer<typeof ModelsConfigSchema>;
  vega: z.infer<typeof VegaConfigSchema>;
  tokenBudget: number;
  maxCostUsd?: number;
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
    name: "scaffold", kind: "agent", prompt: "scaffold", skills: ["rn-template-anatomy"],
    deps: ["plan"], timeoutMs: 600_000, buildPhase: false, internalLoop: false,
    abortOnFailure: false, cwd: "out",
    verify: [{ type: "file_exists", path: "package.json", error: "Template not cloned: package.json missing in app dir" }],
  },
  {
    name: "branding", kind: "agent", prompt: "branding",
    skills: ["rn-template-anatomy", "rn-theming", "firetv-leanback"],
    deps: ["scaffold"], timeoutMs: 600_000, buildPhase: false, internalLoop: false,
    abortOnFailure: false, cwd: "app",
    verify: [
      { type: "git_dirty", error: "Branding phase made no file changes — app is still the unmodified template" },
      { type: "grep", pattern: "{{brand.primary_color}}", path: "packages/shared-ui/", error: "Brand primary color {{brand.primary_color}} not found in shared-ui — theme was not applied" },
    ],
  },
  {
    name: "content", kind: "agent", prompt: "content",
    skills: ["rn-template-anatomy", "rn-manifest-wiring"],
    deps: ["scaffold"], timeoutMs: 600_000, buildPhase: false, internalLoop: false,
    abortOnFailure: false, cwd: "app",
    verify: [
      { type: "file_exists", path: ["packages/shared-ui/src/data", "packages/shared-ui/data"], error: "Manifest wiring failed: no data/ directory found in shared-ui" },
      { type: "grep", pattern: "{{content.title}}", path: "packages/shared-ui/", error: "Content title \"{{content.title}}\" not found in shared-ui — content was not injected" },
    ],
  },
  {
    name: "screens", kind: "agent", prompt: "screens",
    skills: ["rn-template-anatomy", "rn-shared-ui-catalog", "10ft-ui"],
    deps: ["branding", "content"], timeoutMs: 600_000, buildPhase: false,
    internalLoop: false, abortOnFailure: false, cwd: "app", verify: [],
  },
  {
    name: "creative_ui", kind: "agent", prompt: "creative_ui",
    skills: ["rn-template-anatomy", "rn-shared-ui-catalog", "10ft-ui", "creative-tv-ui"],
    deps: ["screens"], timeoutMs: 600_000, buildPhase: false, internalLoop: false,
    abortOnFailure: false, cwd: "app",
    verify: [{ type: "tsc" }],
  },
  {
    name: "navigation", kind: "agent", prompt: "navigation",
    skills: ["rn-template-anatomy", "rn-shared-ui-catalog", "rn-spatial-navigation"],
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
    name: "vega_setup_check", kind: "agent", prompt: "vega_setup_check",
    skills: ["vega-sdk", "amazon-devices-vega-setup-sdk", "amazon-devices-vega-best-practices"],
    deps: ["verify"], timeoutMs: 600_000, requiresPlatform: "firetv-vega",
    buildPhase: true, internalLoop: false, abortOnFailure: false, cwd: "app",
    verify: [
      { type: "file_exists", path: "apps/vega/package.json", error: "No apps/vega package found for Vega target" },
      { type: "forbidden_import", pattern: "react-native-video|expo-font|expo-image", path: "packages/shared-ui/src", error: "Vega-consumed shared UI imports a non-portable mobile/native package" },
    ],
  },
  {
    name: "vega_build_loop", kind: "agent", prompt: "vega_build_loop", skills: ["vega-sdk"],
    deps: ["vega_setup_check"], timeoutMs: 900_000, requiresPlatform: "firetv-vega",
    buildPhase: true, internalLoop: false, abortOnFailure: false, cwd: "app", verify: [],
  },
  {
    name: "vega_qa_loop", kind: "agent", prompt: "vega_qa_loop", skills: ["vega-sdk", "rn-spatial-navigation"],
    deps: ["vega_build_loop"], timeoutMs: 1_800_000, requiresPlatform: "firetv-vega",
    buildPhase: true, internalLoop: true, abortOnFailure: false, cwd: "app", verify: [],
  },
  {
    name: "vega_perf_trace", kind: "agent", prompt: "vega_perf_trace",
    skills: ["vega-sdk", "amazon-devices-vega-app-performance"],
    deps: ["vega_qa_loop"], timeoutMs: 1_200_000, requiresPlatform: "firetv-vega",
    buildPhase: true, internalLoop: true, abortOnFailure: false, cwd: "app", verify: [],
  },
  {
    name: "vega_hot_functions", kind: "agent", prompt: "vega_hot_functions",
    skills: ["vega-sdk", "amazon-devices-vega-app-performance"],
    deps: ["vega_perf_trace"], timeoutMs: 1_200_000, requiresPlatform: "firetv-vega",
    buildPhase: true, internalLoop: true, abortOnFailure: false, cwd: "app", verify: [],
  },
  {
    name: "visual_qa_loop", kind: "visual_qa",
    skills: ["10ft-ui", "rn-theming", "rn-spatial-navigation"],
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
  visual_correctness: ["10ft-ui", "rn-theming"],
  visual_smoke_test: ["10ft-ui"],
  eas_build: ["eas-build"],
  package: [],
});

export const DEFAULT_HARNESS_CONFIG: HarnessConfig = {
  template: {
    repo: "https://github.com/AmazonAppDev/react-native-multi-tv-app-sample.git",
    commit: "5c9dc393fdbc736dc10aa4285b90cf348ff3f846",
  },
  models: { plan: "claude-opus-4-6", execution: "claude-sonnet-4-6" },
  vega: DEFAULT_VEGA_CONFIG,
  tokenBudget: 500_000,
  maxCostUsd: undefined,
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
    vega: user.vega,
    tokenBudget: user.tokenBudget,
    maxCostUsd: user.maxCostUsd,
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
