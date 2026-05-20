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
  "visual_smoke_test",
  "eas_build",
  "package",
] as const;

export type Phase = (typeof PHASES)[number];

export const V1_PHASES: Phase[] = [
  "plan",
  "clone_template",
  "metadata_branding",
  "manifest_wiring",
  "simulator_build",
  "vega_build",
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
  icon: z.string().optional(),
});

export const SectionSchema = z.object({
  id: z.string(),
  kind: z.enum(["featured_hero", "rail", "grid", "text"]),
  data_source: z.string(),
  title: z.string().optional(),
});

export const ScreenSchema = z.object({
  id: z.string(),
  route: z.string(),
  layout: z.enum(["hero+rails", "grid", "detail", "player", "settings", "search"]),
  uses_template_screen: z.union([z.string(), z.boolean()]).optional(),
  sections: z.array(SectionSchema),
});

export const ComponentCustomizationSchema = z.object({
  component: z.string(),
  changes: z.record(z.string()),
});

export const ComponentSpecSchema = z.object({
  name: z.string(),
  description: z.string(),
  props: z.record(z.string()),
});

export const DataBindingSchema = z.object({
  manifest_path: z.string(),
  screen_id: z.string(),
  section_id: z.string(),
});

export const AppSpecSchema = z.object({
  app_name: z.string(),
  theme: z.object({
    mode: z.enum(["dark", "light"]),
    tokens: z.record(z.string()),
  }),
  navigation: z.object({
    type: z.enum(["drawer", "tabs", "single"]),
    routes: z.array(RouteSchema),
  }),
  screens: z.array(ScreenSchema),
  components_to_customize: z.array(ComponentCustomizationSchema),
  components_to_add: z.array(ComponentSpecSchema),
  data_bindings: z.array(DataBindingSchema),
  player: z.object({
    lib: z.literal("react-native-video"),
  }),
  auth: z
    .object({
      provider: z.enum(["none", "oauth"]),
      flow: z.enum(["device_code"]).optional(),
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
