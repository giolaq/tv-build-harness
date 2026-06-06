import { z } from "zod";

// ─── Phase Machine ───────────────────────────────────────────────────────────

export const PHASES = [
  "plan",
  "clone_template",
  "metadata_branding",
  "manifest_wiring",
  "screen_customization",
  "navigation_update",
  "prebuild",
  "static_checks",
  "simulator_build",
  "vega_build",
  "visual_correctness",
  "visual_smoke_test",
  "eas_build",
  "package",
] as const;

export type Phase = (typeof PHASES)[number];

export const PHASE_DEPS: Record<Phase, Phase[]> = {
  plan: [],
  clone_template: ["plan"],
  metadata_branding: ["clone_template"],
  manifest_wiring: ["clone_template"],
  screen_customization: ["metadata_branding", "manifest_wiring"],
  navigation_update: ["screen_customization"],
  prebuild: ["navigation_update"],
  static_checks: ["navigation_update"],
  simulator_build: ["static_checks"],
  vega_build: ["static_checks"],
  visual_correctness: ["simulator_build"],
  visual_smoke_test: ["visual_correctness"],
  eas_build: ["static_checks"],
  package: ["simulator_build", "vega_build"],
};

export const V1_PHASES: Phase[] = [
  "plan",
  "clone_template",
  "metadata_branding",
  "manifest_wiring",
  "screen_customization",
  "navigation_update",
  "static_checks",
  "simulator_build",
  "vega_build",
  "visual_correctness",
  "visual_smoke_test",
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
  layout: z.enum(["hero+rails", "grid", "detail", "player", "settings", "search"]),
  uses_template_screen: z.union([z.string(), z.boolean()]).nullish(),
  sections: z.array(SectionSchema).default([]),
});

export const ComponentCustomizationSchema = z.object({
  component: z.string(),
  changes: z.record(z.string()),
});

export const ComponentSpecSchema = z.object({
  name: z.string(),
  description: z.string(),
  props: z.record(z.string()).default({}),
});

export const DataBindingSchema = z.object({
  manifest_path: z.string().nullish(),
  screen_id: z.string().nullish(),
  section_id: z.string().nullish(),
});

export const AppSpecSchema = z.object({
  app_name: z.string(),
  theme: z.object({
    mode: z.enum(["dark", "light"]),
    tokens: z.record(z.string()).default({}),
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
  id: z.string(),
  title: z.string(),
  description: z.string(),
  duration_sec: z.number(),
  thumbnail_url: z.string(),
  stream_url: z.string(),
  stream_type: z.enum(["hls", "dash", "mp4"]),
  tags: z.array(z.string()),
});

export const CategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  items: z.array(z.string()),
});

export const ContentManifestSchema = z.object({
  title: z.string(),
  description: z.string(),
  categories: z.array(CategorySchema),
  videos: z.array(VideoSchema),
  featured: z.array(z.string()),
});

export type ContentManifest = z.infer<typeof ContentManifestSchema>;

// ─── Brand Kit ───────────────────────────────────────────────────────────────

export const BrandKitSchema = z.object({
  name: z.string(),
  primary_color: z.string(),
  accent_color: z.string(),
  background_color: z.string(),
  font_family: z.string(),
  logo_path: z.string(),
  splash_path: z.string(),
});

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
  template: ScreenTemplateSchema.default("netflix-style"),
  hero_height: z.number().default(500),
  show_hero: z.boolean().default(true),
  tile_size: z.enum(["small", "medium", "large"]).default("medium"),
  tile_ratio: z.enum(["16:9", "4:3", "1:1", "2:3"]).default("16:9"),
  spacing: z.enum(["compact", "normal", "relaxed"]).default("normal"),
  corner_radius: z.number().default(8),
  rails_per_screen: z.number().default(4),
  font_scale: z.number().default(1.0),
  show_descriptions: z.boolean().default(true),
  show_duration: z.boolean().default(true),
  navigation_style: z.enum(["drawer", "tabs", "hidden"]).default("drawer"),
  focus_style: z.enum(["border", "glow", "scale", "border+scale"]).default("border+scale"),
  animation_speed: z.enum(["none", "subtle", "normal", "energetic"]).default("normal"),
});

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
  platforms: z.array(PlatformSchema),
  max_iterations: z.number().default(90),
  max_retries_per_phase: z.number().default(5),
  build_locally: z.boolean().default(true),
  eas_profile: z.string().default("preview"),
});

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
