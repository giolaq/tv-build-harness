import { z } from "zod";
import type { HarnessConfig } from "./harness-config.js";

// ─── Phase Machine ───────────────────────────────────────────────────────────

export const PHASES = [
  "plan",
  "scaffold",
  "branding",
  "content",
  "screens",
  "creative_ui",
  "navigation",
  "prebuild",
  "verify",
  "build_loop",
  "vega_setup_check",
  "vega_build_loop",
  "vega_qa_loop",
  "vega_perf_trace",
  "vega_hot_functions",
  "visual_correctness",
  "visual_qa_loop",
  "android_test_loop",
  "visual_smoke_test",
  "eas_build",
  "package",
] as const;

export type BuiltinPhase = (typeof PHASES)[number];

// Phases are config-driven: custom pipelines may define phases beyond the built-ins.
export type Phase = string;

export const PHASE_DEPS: Record<string, Phase[]> = {
  plan: [],
  scaffold: ["plan"],
  branding: ["scaffold"],
  content: ["scaffold"],
  screens: ["branding", "content"],
  creative_ui: ["screens"],
  navigation: ["creative_ui"],
  prebuild: ["navigation"],
  verify: ["navigation"],
  build_loop: ["verify"],
  vega_setup_check: ["verify"],
  vega_build_loop: ["vega_setup_check"],
  vega_qa_loop: ["vega_build_loop"],
  vega_perf_trace: ["vega_qa_loop"],
  vega_hot_functions: ["vega_perf_trace"],
  android_test_loop: ["build_loop"],
  visual_correctness: ["build_loop"],
  visual_qa_loop: ["build_loop"],
  visual_smoke_test: ["build_loop"],
  eas_build: ["verify"],
  package: ["build_loop", "vega_hot_functions"],
};

export const V1_PHASES: Phase[] = [
  "plan",
  "scaffold",
  "branding",
  "content",
  "screens",
  "creative_ui",
  "navigation",
  "verify",
  "build_loop",
  "vega_setup_check",
  "vega_build_loop",
  "vega_qa_loop",
  "vega_perf_trace",
  "vega_hot_functions",
  "visual_qa_loop",
  "android_test_loop",
];

export interface PhaseConfig {
  name: Phase;
  skills: string[];
  maxRetries: number;
  systemPrompt: string;
}

export type PhaseStatus = "pending" | "running" | "success" | "degraded" | "failed";

export interface PhaseResult {
  phase: Phase;
  status: PhaseStatus;
  iterations: number;
  error?: string;
}

// ─── Screen Tree (Developer Input) ──────────────────────────────────────────

export interface ScreenNode {
  id: string;
  name: string;
  layout: "hero+rails" | "grid" | "detail" | "player" | "settings" | "search" | "list";
  data_source?: string | null;
  icon?: string | null;
  children?: ScreenNode[];
}

export const ScreenNodeSchema: z.ZodType<ScreenNode> = z.lazy(() =>
  z.object({
    id: z.string().describe("Stable screen identifier used by routes and sections."),
    name: z.string().describe("Human-readable screen name."),
    layout: z.enum(["hero+rails", "grid", "detail", "player", "settings", "search", "list"]).describe("Screen layout pattern to generate."),
    data_source: z.string().nullish().describe("Optional content source id for this screen."),
    icon: z.string().nullish().describe("Optional navigation icon name."),
    children: z.array(ScreenNodeSchema).optional().describe("Nested child screens."),
  }).strict()
) as z.ZodType<ScreenNode>;

export const ScreenTreeSchema = z.object({
  navigation_type: z.enum(["drawer", "tabs"]).describe("Top-level navigation pattern."),
  home: ScreenNodeSchema.describe("Home screen node."),
  screens: z.array(ScreenNodeSchema).describe("Additional screen nodes."),
}).strict();

export interface ScreenTree {
  navigation_type: "drawer" | "tabs";
  home: ScreenNode;
  screens: ScreenNode[];
}

// ─── AppSpec (Planner Output) ────────────────────────────────────────────────

export const RouteSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string().nullish(),
});

export const SectionSchema = z.object({
  id: z.string(),
  kind: z.enum(["featured_hero", "rail", "grid", "text"]),
  data_source: z.string().nullish(),
  title: z.string().nullish(),
});

export const ScreenSchema = z.object({
  id: z.string(),
  route: z.string(),
  layout: z.enum(["hero+rails", "grid", "detail", "player", "settings", "search", "list"]),
  uses_template_screen: z.union([z.string(), z.boolean()]).nullish(),
  sections: z.array(SectionSchema).default([]),
});

export const ComponentCustomizationSchema = z.object({
  component: z.string(),
  changes: z.record(z.string(), z.string()),
});

export const ComponentSpecSchema = z.object({
  name: z.string(),
  description: z.string(),
  props: z.record(z.string(), z.string()).default({}),
});

export const DataBindingSchema = z.object({
  manifest_path: z.string().nullish(),
  screen_id: z.string().nullish(),
  section_id: z.string().nullish(),
});

export const AppSpecSchema = z.object({
  app_name: z.string(),
  creative_seed: z.string().optional(),
  theme: z.object({
    mode: z.enum(["dark", "light"]),
    tokens: z.record(z.string(), z.string()).default({}),
  }),
  navigation: z.object({
    type: z.enum(["drawer", "tabs", "single"]),
    routes: z.array(RouteSchema),
  }),
  screens: z.array(ScreenSchema).default([]),
  components_to_customize: z.array(ComponentCustomizationSchema).default([]),
  components_to_add: z.array(ComponentSpecSchema).default([]),
  data_bindings: z.array(DataBindingSchema).default([]),
  player: z.object({
    lib: z.literal("react-native-video"),
  }).default({ lib: "react-native-video" }),
  auth: z
    .object({
      provider: z.enum(["none", "oauth"]),
      flow: z.enum(["device_code"]).nullish(),
    })
    .optional(),
});

export type AppSpec = z.infer<typeof AppSpecSchema>;
export type Screen = z.infer<typeof ScreenSchema>;
export type Section = z.infer<typeof SectionSchema>;

// ─── Content Manifest ────────────────────────────────────────────────────────

export const VideoSchema = z.object({
  id: z.string().describe("Stable video id referenced by categories and featured lists."),
  title: z.string().describe("Display title."),
  description: z.string().describe("Display description."),
  duration_sec: z.number().describe("Runtime in seconds."),
  thumbnail_url: z.string().describe("Image URL used for rails, grids, and detail pages."),
  stream_url: z.string().describe("Playable stream URL."),
  stream_type: z.enum(["hls", "dash", "mp4"]).describe("Stream container/protocol."),
  tags: z.array(z.string()).describe("Search, filtering, or display tags."),
}).strict();

export const CategorySchema = z.object({
  id: z.string().describe("Stable category id."),
  name: z.string().describe("Display name for the category rail or page."),
  items: z.array(z.string()).describe("Video ids included in this category."),
}).strict();

export const ContentManifestSchema = z.object({
  title: z.string().describe("App/content catalog title."),
  description: z.string().describe("One-line catalog description."),
  categories: z.array(CategorySchema).describe("Content groupings used for rails and screens."),
  videos: z.array(VideoSchema).describe("Video records available to the generated app."),
  featured: z.array(z.string()).describe("Video ids to emphasize in hero or featured areas."),
}).strict();

export type ContentManifest = z.infer<typeof ContentManifestSchema>;

// ─── Brand Kit ───────────────────────────────────────────────────────────────

export const BrandKitSchema = z.object({
  name: z.string().describe("App display name."),
  primary_color: z.string().describe("Primary brand color, usually a hex color."),
  accent_color: z.string().describe("Accent color for focus and calls to action."),
  background_color: z.string().describe("Default app background color."),
  font_family: z.string().describe("Preferred font family name."),
  logo_path: z.string().describe("Path or URL to the app logo asset."),
  splash_path: z.string().describe("Path or URL to the splash/loading asset."),
}).strict();

export type BrandKit = z.infer<typeof BrandKitSchema>;

// ─── Design Tokens ──────────────────────────────────────────────────────────

export const ScreenTemplateSchema = z.enum([
  "netflix-style",
  "grid-first",
  "spotlight",
  "minimal",
  "classic",
]);

export const DesignTokensSchema = z.object({
  template: ScreenTemplateSchema.default("netflix-style").describe("Starting visual layout family."),
  hero_height: z.number().default(500).describe("Hero area height in pixels."),
  show_hero: z.boolean().default(true).describe("Whether home should include a hero area."),
  tile_size: z.enum(["small", "medium", "large"]).default("medium").describe("Relative content tile size."),
  tile_ratio: z.enum(["16:9", "4:3", "1:1", "2:3"]).default("16:9").describe("Content tile aspect ratio."),
  spacing: z.enum(["compact", "normal", "relaxed"]).default("normal").describe("Overall spacing density."),
  corner_radius: z.number().default(8).describe("Default radius for cards and surfaces."),
  rails_per_screen: z.number().default(4).describe("Target number of rails visible on a screen."),
  font_scale: z.number().default(1.0).describe("Multiplier for generated typography."),
  show_descriptions: z.boolean().default(true).describe("Whether cards and details show descriptions."),
  show_duration: z.boolean().default(true).describe("Whether videos show runtime metadata."),
  navigation_style: z.enum(["drawer", "tabs", "hidden"]).default("drawer").describe("Preferred navigation UI."),
  focus_style: z.enum(["border", "glow", "scale", "border+scale", "neon", "glass", "sharp"]).default("border+scale").describe("Visual treatment for focused TV elements."),
  animation_speed: z.enum(["none", "subtle", "normal", "energetic"]).default("normal").describe("Motion intensity for generated UI."),
  mood: z.enum(["warm", "cool", "electric", "natural", "minimal", "playful"]).optional().describe("Optional creative mood hint."),
  surface_style: z.enum(["flat", "gradient", "glass", "textured"]).default("gradient").describe("Default surface treatment."),
  card_style: z.enum(["rounded", "sharp", "pill", "angular"]).default("rounded").describe("Default card shape language."),
}).strict();

export type DesignTokens = z.infer<typeof DesignTokensSchema>;
export type ScreenTemplate = z.infer<typeof ScreenTemplateSchema>;

// ─── Run Config ──────────────────────────────────────────────────────────────

export const PlatformSchema = z.enum([
  "androidtv",
  "appletv",
  "firetv-fos",
  "firetv-vega",
  "web",
]);

export type Platform = z.infer<typeof PlatformSchema>;

export const RunConfigSchema = z.object({
  platforms: z.array(PlatformSchema).describe("Target platforms for this run."),
  max_iterations: z.number().default(90).describe("Overall iteration guardrail."),
  max_retries_per_phase: z.number().default(5).describe("Default retry limit per phase."),
  build_locally: z.boolean().default(true).describe("Whether local build phases should run."),
  eas_profile: z.string().default("preview").describe("EAS profile name for Expo-based builds."),
  visual_qa_max_iterations: z.number().default(3).describe("Maximum visual QA repair loop count."),
  visual_qa_pass_threshold: z.enum(["strict", "normal"]).default("normal").describe("Visual QA acceptance strictness."),
  use_devtools: z.boolean().default(false).describe("Whether visual QA may use browser devtools."),
}).strict();

export type RunConfig = z.infer<typeof RunConfigSchema>;

// ─── Tool Layer ──────────────────────────────────────────────────────────────

export interface ToolResult {
  ok: boolean;
  output: unknown;
  error?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

// ─── Session State ───────────────────────────────────────────────────────────

export interface SessionState {
  runId: string;
  workdir: string;
  creativeSeed: string;
  config: RunConfig;
  spec: AppSpec | null;
  currentPhase: Phase;
  phaseResults: Map<Phase, PhaseResult>;
  iteration: number;
  totalIterations: number;
  tokenBudget: number;
  tokensUsed: number;
  messages: Array<{ role: "user" | "assistant"; content: unknown }>;
}

// ─── Skill Metadata ──────────────────────────────────────────────────────────

export interface SkillMeta {
  name: string;
  applies_to: string[];
  filePath: string;
}

// ─── Harness Input (shared by both orchestrators) ────────────────────────────

export interface HarnessInput {
  prompt: string;
  creativeSeed?: string;
  content: ContentManifest;
  brand: BrandKit;
  config: RunConfig;
  design: DesignTokens;
  screenTree?: ScreenTree;
  workdir: string;
  skillsDir: string;
  harness?: HarnessConfig;
}
