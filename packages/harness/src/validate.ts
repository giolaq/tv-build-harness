import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ZodTypeAny } from "zod";
import {
  BrandKitSchema,
  ContentManifestSchema,
  DesignTokensSchema,
  RunConfigSchema,
  ScreenTreeSchema,
} from "./types.js";
import type { BrandKit, ContentManifest } from "./types.js";
import { loadHarnessConfig } from "./harness-config.js";

export interface ValidationIssue {
  code: string;
  message: string;
  hint: string;
  file?: string;
  path?: string;
}

export interface LintRule {
  code: string;
  description: string;
  hint: string;
}

export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export const LINT_RULES: LintRule[] = [
  { code: "sparse_rail", description: "A content rail has fewer than 3 items and will look sparse on TV.", hint: "Add at least 3 items to each category rail." },
  { code: "too_many_rails", description: "More than 10 rails can create excessive navigation depth.", hint: "Group or remove rails until the home screen is easier to scan." },
  { code: "brand_contrast", description: "Brand foreground/background contrast is below 4.5:1.", hint: "Choose a primary or accent color with stronger contrast against the background." },
  { code: "missing_prompt", description: "prompt.txt is missing, so the run will use the default generated brief.", hint: "Add prompt.txt for project-specific goals and constraints." },
  { code: "non_https_url", description: "A committed image or stream URL does not use HTTPS.", hint: "Use HTTPS URLs or local checked-in placeholder assets." },
];

export function validateInputDir(inputDir: string, explicitConfigPath?: string): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const content = readJsonFile(join(inputDir, "content.json"), ContentManifestSchema, "content.json", errors);
  const brand = existsSync(join(inputDir, "brand.json"))
    ? readJsonFile(join(inputDir, "brand.json"), BrandKitSchema, "brand.json", errors)
    : undefined;

  if (existsSync(join(inputDir, "design.json"))) readJsonFile(join(inputDir, "design.json"), DesignTokensSchema, "design.json", errors);
  if (existsSync(join(inputDir, "run.json"))) readJsonFile(join(inputDir, "run.json"), RunConfigSchema, "run.json", errors);
  if (existsSync(join(inputDir, "screens.json"))) readJsonFile(join(inputDir, "screens.json"), ScreenTreeSchema, "screens.json", errors);

  try {
    loadHarnessConfig({ explicitPath: explicitConfigPath, inputDir });
  } catch (err) {
    errors.push({
      code: "invalid_harness_config",
      message: err instanceof Error ? err.message : String(err),
      hint: "Fix harness.config.json or remove the explicit --config path.",
      file: explicitConfigPath ?? "harness.config.json",
    });
  }

  if (!existsSync(join(inputDir, "prompt.txt"))) {
    warnings.push(ruleWarning("missing_prompt", "prompt.txt is missing.", "prompt.txt"));
  }

  if (content) lintContent(content, warnings);
  if (brand) lintBrand(brand, warnings);

  return { errors, warnings };
}

function readJsonFile<T extends ZodTypeAny>(
  path: string,
  schema: T,
  label: string,
  errors: ValidationIssue[]
): T["_output"] | undefined {
  if (!existsSync(path)) {
    if (label === "content.json") {
      errors.push({
        code: "missing_content",
        message: `Missing ${label}.`,
        hint: "Create content.json or run tv-build init <dir>.",
        file: label,
      });
    }
    return undefined;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (err) {
    errors.push({
      code: "invalid_json",
      message: `${label} is not valid JSON: ${err instanceof Error ? err.message : err}`,
      hint: `Fix ${label} and rerun tv-build validate.`,
      file: label,
    });
    return undefined;
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({
        code: "schema_validation_failed",
        message: issue.message,
        hint: `Run tv-build schema ${label.replace(".json", "")} --json to inspect the contract.`,
        file: label,
        path: issue.path.join("."),
      });
    }
    return undefined;
  }

  return parsed.data;
}

function lintContent(content: ContentManifest, warnings: ValidationIssue[]): void {
  for (const category of content.categories) {
    if (category.items.length < 3) {
      warnings.push(ruleWarning("sparse_rail", `Rail "${category.name}" has ${category.items.length} item(s).`, `content.json:categories.${category.id}.items`));
    }
  }
  if (content.categories.length > 10) {
    warnings.push(ruleWarning("too_many_rails", `Content has ${content.categories.length} rails.`, "content.json:categories"));
  }

  for (const video of content.videos) {
    for (const field of ["thumbnail_url", "stream_url"] as const) {
      const value = video[field];
      if (isUrl(value) && !value.startsWith("https://")) {
        warnings.push(ruleWarning("non_https_url", `${field} for "${video.id}" is not HTTPS.`, `content.json:videos.${video.id}.${field}`));
      }
    }
  }
}

function lintBrand(brand: BrandKit, warnings: ValidationIssue[]): void {
  for (const [name, value] of [["primary_color", brand.primary_color], ["accent_color", brand.accent_color]] as const) {
    const contrast = contrastRatio(value, brand.background_color);
    if (contrast !== null && contrast < 4.5) {
      warnings.push(ruleWarning("brand_contrast", `${name} contrast against background is ${contrast.toFixed(2)}:1.`, `brand.json:${name}`));
    }
  }

  for (const field of ["logo_path", "splash_path"] as const) {
    const value = brand[field];
    if (isUrl(value) && !value.startsWith("https://")) {
      warnings.push(ruleWarning("non_https_url", `${field} is not HTTPS.`, `brand.json:${field}`));
    }
  }
}

function ruleWarning(code: string, message: string, path: string): ValidationIssue {
  const rule = LINT_RULES.find((item) => item.code === code)!;
  return { code, message, hint: rule.hint, path };
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function contrastRatio(a: string, b: string): number | null {
  const left = relativeLuminance(a);
  const right = relativeLuminance(b);
  if (left === null || right === null) return null;
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const channels = [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

