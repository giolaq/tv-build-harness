import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppSpec, BrandKit, PhaseResult } from "./types.js";
import { generateScreenshotReport } from "./screenshot-report.js";

export interface RunReportInput {
  outDir: string;
  runId: string;
  mode: string;
  platforms: string[];
  templateRepo: string;
  tokensUsed: number;
  tokenBudget: number;
  totalCost: number;
  phaseResults: Map<string, PhaseResult>;
  phaseCosts?: Map<string, number>;
  spec: AppSpec | null;
  brand?: BrandKit;
}

/** Writes out/<runId>/report.md — the shared end-of-run summary for both modes. */
export function writeRunReport(input: RunReportInput): void {
  const { spec, phaseResults, phaseCosts } = input;

  const lines: string[] = [
    `# Run Report`,
    ``,
    `**Run ID:** ${input.runId}`,
    `**Date:** ${new Date().toISOString()}`,
    `**App:** ${spec?.app_name ?? "Unknown"}`,
    `**Platforms:** ${input.platforms.join(", ")}`,
    `**Mode:** ${input.mode}`,
    `**Template:** ${input.templateRepo}`,
    ``,
    `## Token Usage`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total tokens | ${input.tokensUsed.toLocaleString()} |`,
    `| Budget | ${input.tokenBudget.toLocaleString()} |`,
    `| Utilization | ${Math.round((input.tokensUsed / input.tokenBudget) * 100)}% |`,
    `| Total cost | $${input.totalCost.toFixed(4)} |`,
    ``,
    `## Phases`,
    ``,
    `| Phase | Status | Iterations | Cost |`,
    `|-------|--------|------------|------|`,
  ];

  for (const [phase, result] of phaseResults) {
    const icon = result.status === "success" ? "✓" : result.status === "degraded" ? "~" : "✗";
    const cost = phaseCosts?.get(phase);
    lines.push(`| ${icon} ${phase} | ${result.status} | ${result.iterations} | ${cost ? `$${cost.toFixed(4)}` : "—"} |`);
    if (result.error) {
      lines.push(`| | Error: ${result.error.slice(0, 100)} | | |`);
    }
  }

  const succeeded = [...phaseResults.values()].filter(r => r.status === "success").length;
  lines.push("");
  lines.push(`**Result:** ${succeeded}/${phaseResults.size} phases succeeded`);

  lines.push("");
  lines.push("## AppSpec Summary");
  lines.push("");
  if (spec) {
    lines.push(`- **Navigation:** ${spec.navigation.type}`);
    lines.push(`- **Screens:** ${spec.screens.map(s => s.id).join(", ")}`);
    lines.push(`- **Theme mode:** ${spec.theme.mode}`);
    if (input.brand) {
      lines.push(`- **Brand:** ${input.brand.name} (${input.brand.primary_color} / ${input.brand.accent_color})`);
    }
  } else {
    lines.push("*Plan phase failed — no AppSpec generated.*");
  }

  lines.push("");
  lines.push("## Artifacts");
  lines.push("");
  lines.push("- `spec.json` — Planner output");
  lines.push("- `run.log` — NDJSON audit trail");
  lines.push("- `app/` — Generated application source");

  const screenshotReportPath = generateScreenshotReport(input.outDir, spec?.app_name ?? "TV App");
  if (screenshotReportPath) {
    lines.push("- `screenshots.html` — Visual comparison report");
  }

  lines.push("");
  writeFileSync(join(input.outDir, "report.md"), lines.join("\n"));
}
