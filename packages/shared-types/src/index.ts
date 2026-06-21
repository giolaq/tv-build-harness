export type Platform = "androidtv" | "appletv" | "firetv-fos" | "firetv-vega" | "web";

export type SpecTier = "easy" | "medium" | "hard";

export type RunOutcome = "pass" | "harness_failure" | "infra_error";

export type Phase =
  | "plan"
  | "scaffold"
  | "branding"
  | "content"
  | "screens"
  | "creative_ui"
  | "navigation"
  | "verify"
  | "build_loop"
  | "vega_build_loop"
  | "visual_qa_loop"
  | "android_test_loop";

export interface PinnedEnv {
  modelPlan: string;
  modelExecution: string;
  templateRepo: string;
  templateBranch: string;
  nodeVersion: string;
  claudeCliVersion: string;
  harnessCommit: string;
  timestamp: string;
}

export interface Expected {
  files_exist: string[];
  files_not_exist?: string[];
  nav_routes: string[];
  theme_tokens?: Record<string, string>;
  screen_count?: number;
  focus_nodes_min?: number;
  platforms_build: Platform[];
  content_items_expected?: number;
  content_titles?: string[];
  rubric_thresholds?: {
    intent: number;
    layout: number;
    theme: number;
    visual: number;
  };
}

export type CheckSeverity = "pass" | "warn" | "fail";

export interface CheckResult {
  level: 1 | 2 | 3 | 4 | 5;
  name: string;
  severity: CheckSeverity;
  message: string;
  details?: unknown;
}

export type BuildErrorClass = "compile" | "dependency" | "config" | "asset" | "unknown";

export interface RubricScore {
  rubricVersion: string;
  intent: number;
  layout: number;
  theme: number;
  visual: number;
  judgeValidated: boolean;
}

export interface RunRecord {
  id: string;
  specId: string;
  tier: SpecTier;
  outcome: RunOutcome;
  env: PinnedEnv;
  costUsd: number;
  latencyS: number;
  checks: CheckResult[];
  buildResults: Record<Platform, { pass: boolean; errorClass?: BuildErrorClass; timeS: number }>;
  rubric?: RubricScore;
  artifactPath?: string;
  retryOf?: string;
  error?: string;
}

export interface MetricWithCI {
  metric: string;
  n: number;
  k: number;
  rate: number;
  ci95Lower: number;
  ci95Upper: number;
}

export interface ComparisonVerdict {
  metric: string;
  specId: string;
  baseRate: number;
  baseCILower: number;
  baseCIUpper: number;
  headRate: number;
  headCILower: number;
  headCIUpper: number;
  pValue: number;
  significant: boolean;
  regression: boolean;
}

export interface GoldenSpec {
  id: string;
  name: string;
  description: string;
  tier: SpecTier;
  inputDir: string;
  expected: Expected;
}

export interface VerifyConfig {
  n: number;
  perSpecN?: Record<string, number>;
  infraRetryMax: number;
  tierLevelMap: Record<SpecTier, number[]>;
  regressionRule: "ci_below_point";
  baselinePath?: string;
  artifactsDir: string;
  harnessCommand: string;
  judge?: {
    model: string;
    validated: boolean;
  };
}
