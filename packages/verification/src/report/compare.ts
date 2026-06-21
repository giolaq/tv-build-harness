import type { MetricWithCI, ComparisonVerdict } from "@tv-harness/shared-types";
import { twoPropZTest } from "../stats/proportion.js";
import { fisherExact } from "../stats/fisher.js";
import { holmCorrection } from "../stats/correction.js";

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
