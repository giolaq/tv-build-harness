import type { RunRecord, MetricWithCI } from "@tv-harness/shared-types";
import { wilsonCI } from "../stats/wilson.js";

/** Map wilsonCI output fields to MetricWithCI fields. */
function toMetric(metric: string, n: number, k: number, ci: { rate: number; lower: number; upper: number }): MetricWithCI {
  return { metric, n, k, rate: ci.rate, ci95Lower: ci.lower, ci95Upper: ci.upper };
}

export function aggregate(records: RunRecord[]): MetricWithCI[] {
  // Exclude infra_error runs from denominators (Risk 2)
  const valid = records.filter(r => r.outcome !== "infra_error");
  const n = valid.length;
  if (n === 0) return [];

  const metrics: MetricWithCI[] = [];

  // Overall pass rate
  const passes = valid.filter(r => r.outcome === "pass").length;
  metrics.push(toMetric("overall_pass_rate", n, passes, wilsonCI(n, passes)));

  // Structural pass rate (Level 1)
  const withStructural = valid.filter(r => r.checks.some(c => c.level === 1));
  if (withStructural.length > 0) {
    const structPass = withStructural.filter(r => !r.checks.some(c => c.level === 1 && c.severity === "fail")).length;
    metrics.push(toMetric("structural_pass_rate", withStructural.length, structPass, wilsonCI(withStructural.length, structPass)));
  }

  // Build pass rate per platform (Level 2)
  const platforms = new Set<string>();
  for (const r of valid) {
    for (const p of Object.keys(r.buildResults)) platforms.add(p);
  }
  for (const platform of platforms) {
    const withBuild = valid.filter(r => r.buildResults[platform as keyof typeof r.buildResults]);
    if (withBuild.length > 0) {
      const buildPass = withBuild.filter(r => r.buildResults[platform as keyof typeof r.buildResults]?.pass).length;
      metrics.push(toMetric(`build_pass_rate:${platform}`, withBuild.length, buildPass, wilsonCI(withBuild.length, buildPass)));
    }
  }

  // Focus nav pass rate
  const withFocus = valid.filter(r => r.checks.some(c => c.name === "focus_nodes"));
  if (withFocus.length > 0) {
    const focusPass = withFocus.filter(r => !r.checks.some(c => c.name === "focus_nodes" && c.severity === "fail")).length;
    metrics.push(toMetric("focus_nav_pass_rate", withFocus.length, focusPass, wilsonCI(withFocus.length, focusPass)));
  }

  // Infra error rate (reported separately)
  const allRuns = records.length;
  const infraErrors = records.filter(r => r.outcome === "infra_error").length;
  if (infraErrors > 0) {
    metrics.push(toMetric("infra_error_rate", allRuns, infraErrors, wilsonCI(allRuns, infraErrors)));
  }

  // Cost and latency (mean, not rate — report as-is)
  const costs = valid.map(r => r.costUsd);
  const latencies = valid.map(r => r.latencyS);
  if (costs.length > 0) {
    const avgCost = costs.reduce((a, b) => a + b, 0) / costs.length;
    metrics.push({ metric: "avg_cost_usd", n: costs.length, k: 0, rate: avgCost, ci95Lower: Math.min(...costs), ci95Upper: Math.max(...costs) });
  }
  if (latencies.length > 0) {
    const avgLat = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    metrics.push({ metric: "avg_latency_s", n: latencies.length, k: 0, rate: avgLat, ci95Lower: Math.min(...latencies), ci95Upper: Math.max(...latencies) });
  }

  return metrics;
}
