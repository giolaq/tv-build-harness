import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AuditFinding } from "./contracts.js";
import type { SourceDiscovery } from "./source-app.js";

export function auditSource(source: SourceDiscovery): AuditFinding[] {
  const findings: AuditFinding[] = [];
  add(findings, "framework", source.dependencies.some((d) => d === "react-native"), "package.json", "Keep shared React Native product logic.");
  const nav = source.dependencies.filter((d) => /navigation|router/.test(d));
  findings.push({ area: "navigation", classification: nav.length ? "replace" : "manual", evidence: nav.join(", ") || "No navigation dependency detected", recommendation: "Define remote navigation, back, and focus restoration explicitly." });
  const risky = source.dependencies.filter((d) => /camera|location|maps|gesture|bluetooth|async-storage/i.test(d));
  for (const dependency of risky) findings.push({ area: "dependency", classification: "replace", evidence: dependency, recommendation: "Confirm Vega support or isolate behind an adapter." });
  const brief = join(source.source, "workshop-brief.md");
  findings.push({ area: "product_scope", classification: existsSync(brief) ? "portable" : "manual", evidence: existsSync(brief) ? brief : "workshop-brief.md missing", recommendation: "Choose one bounded screen or flow before execution." });
  if (existsSync(join(source.source, "package.json")) && /drm|billing/i.test(readFileSync(join(source.source, "package.json"), "utf8"))) {
    findings.push({ area: "protected_service", classification: "out_of_scope", evidence: "package.json", recommendation: "Use a workshop mock and plan production integration separately." });
  }
  findings.push({ area: "focus", classification: "replace", evidence: "Behavioral audit required", recommendation: "Add initial focus, directional movement, focus styling, back, and restoration checks." });
  return findings;
}

function add(findings: AuditFinding[], area: string, ok: boolean, evidence: string, recommendation: string): void {
  findings.push({ area, classification: ok ? "portable" : "manual", evidence, recommendation });
}

export function summarize(findings: AuditFinding[]): Record<string, number> {
  return findings.reduce<Record<string, number>>((sum, item) => ({ ...sum, [item.classification]: (sum[item.classification] ?? 0) + 1 }), {});
}
