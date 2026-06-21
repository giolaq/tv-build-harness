#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { VerifyConfig, GoldenSpec, RunRecord } from "@tv-harness/shared-types";
import { runSuite } from "./runner.js";
import { aggregate } from "./report/aggregate.js";
import { compare } from "./report/compare.js";
import {
  renderHeader,
  renderRunResult,
  renderSummaryTable,
  renderVerdict,
  renderComparisonTable,
  renderReportHeader,
  startLiveProgress,
} from "./tui.js";

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
      // Resolve inputDir relative to the spec file location
      spec.inputDir = resolve(specsDir, dir, spec.inputDir);
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

      // For each spec, run suite and display live progress
      const allRecords: RunRecord[] = [];

      for (const spec of specs) {
        // Render header
        console.log("");
        console.log(renderHeader(spec, config));
        console.log("");

        // Start live progress timer
        const progress = startLiveProgress();

        const records = await runSuite({
          specs: [spec],
          config,
          onProgress: (_specId, run, total) => {
            progress.update(run, total);
          },
        });

        progress.stop();
        console.log(""); // newline after progress cleared

        // Display run results
        for (let i = 0; i < records.length; i++) {
          const lines = renderRunResult(records[i], i + 1);
          for (const line of lines) {
            console.log(line);
          }
        }

        allRecords.push(...records);
      }

      // Aggregate and display summary
      const metrics = aggregate(allRecords);
      console.log("");
      console.log(renderSummaryTable(metrics));

      // Determine overall verdict
      const hasRegression = allRecords.some(r => r.outcome === "harness_failure");
      console.log(renderVerdict(hasRegression));

      if (hasRegression) {
        process.exit(1);
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

      const baseRecords = JSON.parse(readFileSync(resolve(basePath), "utf-8")) as RunRecord[];
      const headRecords = JSON.parse(readFileSync(resolve(headPath), "utf-8")) as RunRecord[];

      const baseMetrics = aggregate(baseRecords);
      const headMetrics = aggregate(headRecords);
      const verdicts = compare(baseMetrics, headMetrics);

      console.log("");
      console.log(renderComparisonTable(verdicts));

      const hasRegression = verdicts.some(v => v.regression);
      console.log(renderVerdict(hasRegression));

      if (hasRegression) {
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
      const records = JSON.parse(readFileSync(resolve(bundlePath), "utf-8")) as RunRecord[];
      const metrics = aggregate(records);

      console.log("");
      console.log(renderReportHeader(bundlePath, records.length));
      console.log("");
      console.log(renderSummaryTable(metrics));

      const hasFailures = records.some(r => r.outcome === "harness_failure");
      console.log(renderVerdict(hasFailures));
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
