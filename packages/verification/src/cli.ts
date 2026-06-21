#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { VerifyConfig, GoldenSpec } from "@tv-harness/shared-types";
import { runSuite } from "./runner.js";
import { aggregate } from "./report/aggregate.js";
import { compare, formatVerdictTable } from "./report/compare.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const command = args[0];

function loadConfig(): VerifyConfig {
  const configPath = resolve(__dirname, "../verify.config.json");
  return JSON.parse(readFileSync(configPath, "utf-8"));
}

function loadSpecs(specFilter?: string): GoldenSpec[] {
  const specsDir = resolve(__dirname, "../tests/golden");
  if (!existsSync(specsDir)) {
    console.error("No golden specs found at", specsDir);
    process.exit(1);
  }
  // Load all spec.json files from golden directories
  const dirs = readdirSync(specsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const specs: GoldenSpec[] = [];
  for (const dir of dirs) {
    const specPath = join(specsDir, dir, "spec.json");
    if (existsSync(specPath)) {
      const spec = JSON.parse(readFileSync(specPath, "utf-8")) as GoldenSpec;
      if (!specFilter || specFilter === "all" || spec.id === specFilter) {
        specs.push(spec);
      }
    }
  }
  return specs;
}

async function main() {
  switch (command) {
    case "run": {
      const specFilter = args.find(a => a.startsWith("--spec="))?.split("=")[1] ?? "all";
      const config = loadConfig();
      const specs = loadSpecs(specFilter);

      if (specs.length === 0) {
        console.error("No specs matched filter:", specFilter);
        process.exit(1);
      }

      console.log(`Running ${specs.length} spec(s), N=${config.n} per spec`);
      const records = await runSuite({
        specs,
        config,
        onProgress: (specId, run, total) => {
          console.log(`  [${specId}] run ${run}/${total}`);
        },
      });

      const metrics = aggregate(records);
      console.log("\n=== Aggregated Metrics ===");
      for (const m of metrics) {
        console.log(`  ${m.metric}: ${m.rate.toFixed(3)} [${m.ci95Lower.toFixed(3)}, ${m.ci95Upper.toFixed(3)}] (n=${m.n})`);
      }
      break;
    }

    case "compare": {
      const basePath = args.find(a => a.startsWith("--base="))?.split("=")[1];
      const headPath = args.find(a => a.startsWith("--head="))?.split("=")[1];

      if (!basePath || !headPath) {
        console.error("Usage: verify compare --base=<path> --head=<path>");
        process.exit(1);
      }

      const baseRecords = JSON.parse(readFileSync(resolve(basePath), "utf-8"));
      const headRecords = JSON.parse(readFileSync(resolve(headPath), "utf-8"));

      const baseMetrics = aggregate(baseRecords);
      const headMetrics = aggregate(headRecords);
      const verdicts = compare(baseMetrics, headMetrics);

      console.log("\n=== Comparison Verdicts ===");
      console.log(formatVerdictTable(verdicts));

      const hasRegression = verdicts.some(v => v.regression);
      if (hasRegression) {
        console.error("\nREGRESSION DETECTED");
        process.exit(1);
      }
      break;
    }

    case "report": {
      const bundlePath = args[1];
      if (!bundlePath) {
        console.error("Usage: verify report <bundle.json>");
        process.exit(1);
      }
      const records = JSON.parse(readFileSync(resolve(bundlePath), "utf-8"));
      const metrics = aggregate(records);
      console.log("=== Report ===");
      for (const m of metrics) {
        console.log(`  ${m.metric}: ${m.rate.toFixed(3)} [${m.ci95Lower.toFixed(3)}, ${m.ci95Upper.toFixed(3)}] (n=${m.n})`);
      }
      break;
    }

    default:
      console.log("Usage: verify <run|compare|report> [options]");
      console.log("  run --spec=<id|all>     Run verification suite");
      console.log("  compare --base=<path> --head=<path>  Compare two run bundles");
      console.log("  report <bundle.json>    Show metrics from a bundle");
      process.exit(0);
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
