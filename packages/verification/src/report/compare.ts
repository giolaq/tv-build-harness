import type { EnvDiff, MetricWithCI, ComparisonVerdict, PinnedEnv, RunRecord } from "@tv-build/shared-types";
import { twoPropZTest } from "../stats/proportion.js";
import { fisherExact } from "../stats/fisher.js";
import { holmCorrection } from "../stats/correction.js";
import { aggregate } from "./aggregate.js";

export interface BundleComparison {
  verdicts: ComparisonVerdict[];
  envDiffs: EnvDiff[];
  banner?: string;
}

export function compareRunBundles(
  baseRecords: RunRecord[],
  headRecords: RunRecord[],
  options: { allowEnvDrift?: boolean } = {},
): BundleComparison {
  const envDiffs = diffPinnedEnv(firstEnv(baseRecords), firstEnv(headRecords));
  const refusing = envDiffs.filter((diff) => diff.severity === "refuse");
  if (refusing.length > 0 && !options.allowEnvDrift) {
    const details = refusing.map((diff) => `${diff.field}: ${String(diff.base)} -> ${String(diff.head)}`).join("; ");
    throw new Error(`Refusing confounded comparison; environment drift detected: ${details}. Rerun with --allow-env-drift to override.`);
  }
  return {
    verdicts: compare(aggregate(baseRecords), aggregate(headRecords)),
    envDiffs,
    banner: refusing.length > 0 ? "CONFOUNDED COMPARISON: environment drift was allowed explicitly." : undefined,
  };
}

export function diffPinnedEnv(base?: PinnedEnv, head?: PinnedEnv): EnvDiff[] {
  if (!base || !head) return [];
  const diffs: EnvDiff[] = [];
  const refuseFields: Array<keyof PinnedEnv> = ["modelPlan", "modelExecution", "templateCommits", "seedPolicy", "fixedSeed", "judge"];
  const warnFields: Array<keyof PinnedEnv> = ["nodeVersion", "claudeCliVersion"];
  for (const field of refuseFields) {
    pushDiff(diffs, field, base[field], head[field], "refuse");
  }
  for (const field of warnFields) {
    pushDiff(diffs, field, base[field], head[field], "warn");
  }
  return diffs;
}

function firstEnv(records: RunRecord[]): PinnedEnv | undefined {
  return records.find((record) => record.env)?.env;
}

function pushDiff(diffs: EnvDiff[], field: keyof PinnedEnv, base: unknown, head: unknown, severity: EnvDiff["severity"]): void {
  if (JSON.stringify(base ?? null) !== JSON.stringify(head ?? null)) {
    diffs.push({ field, base, head, severity });
  }
}

export function compare(base: MetricWithCI[], head: MetricWithCI[]): ComparisonVerdict[] {
  const verdicts: ComparisonVerdict[] = [];
  const pValues: number[] = [];

  for (const headMetric of head) {
    const baseMetric = base.find(b => b.metric === headMetric.metric);
    if (!baseMetric) continue;
    // Skip non-rate metrics (cost, latency use Mann-Whitney separately)
    if (headMetric.metric.startsWith("avg_")) continue;

    // Choose test: Fisher's exact for small N or near 0/1, else two-proportion z
    let pValue: number;
    if (baseMetric.n < 20 || headMetric.n < 20 || baseMetric.rate < 0.05 || baseMetric.rate > 0.95) {
      const a = baseMetric.k;
      const b = baseMetric.n - baseMetric.k;
      const c = headMetric.k;
      const d = headMetric.n - headMetric.k;
      pValue = fisherExact(a, b, c, d).pValue;
    } else {
      pValue = twoPropZTest(baseMetric.n, baseMetric.k, headMetric.n, headMetric.k).pValue;
    }

    pValues.push(pValue);
    verdicts.push({
      metric: headMetric.metric,
      specId: "all",
      baseRate: baseMetric.rate,
      baseCILower: baseMetric.ci95Lower,
      baseCIUpper: baseMetric.ci95Upper,
      headRate: headMetric.rate,
      headCILower: headMetric.ci95Lower,
      headCIUpper: headMetric.ci95Upper,
      pValue,
      significant: false,  // filled after Holm correction
      regression: false,   // filled after
    });
  }

  // Apply Holm correction
  if (pValues.length > 0) {
    const { significant } = holmCorrection(pValues);
    for (let i = 0; i < verdicts.length; i++) {
      verdicts[i].significant = significant[i];
      // Regression rule (Risk 5): head's lower CI below base's point estimate
      verdicts[i].regression = significant[i] && verdicts[i].headCILower < verdicts[i].baseRate;
    }
  }

  return verdicts;
}

export function formatVerdictTable(verdicts: ComparisonVerdict[]): string {
  const header = "| Metric | Base Rate | Head Rate | p-value | Significant | Regression |";
  const sep = "|--------|-----------|-----------|---------|-------------|------------|";
  const rows = verdicts.map(v =>
    `| ${v.metric} | ${v.baseRate.toFixed(3)} [${v.baseCILower.toFixed(3)}, ${v.baseCIUpper.toFixed(3)}] | ${v.headRate.toFixed(3)} [${v.headCILower.toFixed(3)}, ${v.headCIUpper.toFixed(3)}] | ${v.pValue.toFixed(4)} | ${v.significant ? "YES" : "no"} | ${v.regression ? "YES" : "no"} |`
  );
  return [header, sep, ...rows].join("\n");
}
