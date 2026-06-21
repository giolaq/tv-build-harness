/**
 * Terminal UI for TV App Harness Verification.
 *
 * Uses chalk for colors and Unicode box-drawing for layout.
 * No heavy frameworks (Ink, blessed) — just ANSI escape codes
 * with manual cursor control for live progress updates.
 */
import chalk from "chalk";
import type { RunRecord, GoldenSpec, VerifyConfig, MetricWithCI, ComparisonVerdict } from "@tv-harness/shared-types";

// ─── Box Drawing ───────────────────────────────────────────────────────────────

const BOX_WIDTH = 60;

function boxTop(title?: string): string {
  if (title) {
    const label = `─ ${title} `;
    const rest = "─".repeat(Math.max(0, BOX_WIDTH - label.length - 2));
    return `┌${label}${rest}┐`;
  }
  return `┌${"─".repeat(BOX_WIDTH - 2)}┐`;
}

function boxBottom(): string {
  return `└${"─".repeat(BOX_WIDTH - 2)}┘`;
}

function boxLine(text: string): string {
  const stripped = stripAnsi(text);
  const pad = Math.max(0, BOX_WIDTH - 4 - stripped.length);
  return `│  ${text}${" ".repeat(pad)}  │`;
}

function boxSep(): string {
  return `│ ${"─".repeat(BOX_WIDTH - 4)} │`;
}

// Strip ANSI codes for width calculation
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}

// ─── Time Formatting ───────────────────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

// ─── Progress Bar ──────────────────────────────────────────────────────────────

function progressBar(current: number, total: number, width = 20): string {
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  const bar = chalk.green("█".repeat(filled)) + chalk.dim("░".repeat(empty));
  return bar;
}

// ─── Header ────────────────────────────────────────────────────────────────────

export function renderHeader(spec: GoldenSpec, config: VerifyConfig): string {
  const version = "v0.1.0";
  const n = config.perSpecN?.[spec.id] ?? config.n;
  const levels = config.tierLevelMap[spec.tier].join(",");
  const lines: string[] = [];

  lines.push(boxTop());
  lines.push(boxLine(chalk.bold(`TV App Harness Verification ${chalk.dim(version)}`) ));
  lines.push(boxLine(
    `Spec: ${chalk.cyan(spec.id)} (${spec.tier}) ${chalk.dim("•")} N=${n} ${chalk.dim("•")} Levels: ${levels}`
  ));
  lines.push(boxBottom());

  return lines.join("\n");
}

// ─── Progress Line (for live updating with \r) ─────────────────────────────────

export function renderProgressLine(run: number, total: number, elapsedS: number): string {
  const bar = progressBar(run, total);
  const elapsed = chalk.dim(formatElapsed(elapsedS));
  return `  Run ${run}/${total}  ${bar}  ${elapsed} elapsed`;
}

// ─── Run Result Lines ──────────────────────────────────────────────────────────

export function renderRunResult(record: RunRecord, runIndex: number): string[] {
  const lines: string[] = [];
  const totalChecks = record.checks.length;
  const passedChecks = record.checks.filter(c => c.severity === "pass").length;
  const failedChecks = record.checks.filter(c => c.severity === "fail").length;
  const warnChecks = record.checks.filter(c => c.severity === "warn").length;

  const cost = formatCost(record.costUsd);
  const time = formatElapsed(record.latencyS);

  if (record.outcome === "pass") {
    lines.push(
      `  ${chalk.green("✓")} Run ${runIndex}: ${chalk.green(`${passedChecks}/${totalChecks} checks passed`)} ${chalk.dim(`(${cost}, ${time})`)}`
    );
  } else if (record.outcome === "infra_error") {
    lines.push(
      `  ${chalk.yellow("!")} Run ${runIndex}: ${chalk.yellow("infra error")} ${chalk.dim(`— ${record.error ?? "unknown"}`)}`
    );
  } else {
    // harness_failure
    const summary = warnChecks > 0
      ? `${passedChecks}/${totalChecks} passed, ${failedChecks} failed, ${warnChecks} warn`
      : `${passedChecks}/${totalChecks} passed, ${failedChecks} failed`;
    lines.push(
      `  ${chalk.red("✗")} Run ${runIndex}: ${chalk.red(summary)} ${chalk.dim(`(${cost}, ${time})`)}`
    );

    // Show individual failures
    const failures = record.checks.filter(c => c.severity === "fail");
    for (const f of failures) {
      lines.push(`    ${chalk.dim("└─")} ${chalk.red("FAIL")}: ${f.name} ${chalk.dim("—")} ${f.message}`);
    }
  }

  return lines;
}

// ─── Summary Table ─────────────────────────────────────────────────────────────

export function renderSummaryTable(metrics: MetricWithCI[]): string {
  const lines: string[] = [];

  lines.push(boxTop("Results"));
  lines.push(boxLine(
    `${chalk.bold(pad("Metric", 26))}${chalk.bold(pad("Rate", 9))}${chalk.bold(pad("95% CI", 16))}${chalk.bold("n")}`
  ));
  lines.push(boxSep());

  for (const m of metrics) {
    if (m.metric === "avg_cost_usd") {
      lines.push(boxLine(
        `${pad(m.metric, 26)}${pad(formatCost(m.rate), 9)}${pad("", 16)}${m.n}`
      ));
    } else if (m.metric === "avg_latency_s") {
      lines.push(boxLine(
        `${pad(m.metric, 26)}${pad(formatElapsed(m.rate), 9)}${pad("", 16)}${m.n}`
      ));
    } else {
      const ciStr = `[${m.ci95Lower.toFixed(2)}, ${m.ci95Upper.toFixed(2)}]`;
      const rateStr = m.rate.toFixed(3);
      const rateColored = m.rate >= 0.9 ? chalk.green(rateStr) : m.rate >= 0.7 ? chalk.yellow(rateStr) : chalk.red(rateStr);
      lines.push(boxLine(
        `${pad(m.metric, 26)}${pad(rateColored, 9 + (rateColored.length - rateStr.length))}${pad(ciStr, 16)}${m.n}`
      ));
    }
  }

  lines.push(boxBottom());
  return lines.join("\n");
}

function pad(s: string, width: number): string {
  const stripped = stripAnsi(s);
  const extra = Math.max(0, width - stripped.length);
  return s + " ".repeat(extra);
}

// ─── Verdict ───────────────────────────────────────────────────────────────────

export function renderVerdict(hasRegression: boolean): string {
  if (hasRegression) {
    return `\n  ${chalk.red.bold("✗ FAIL")} ${chalk.dim("—")} Regression detected\n`;
  }
  return `\n  ${chalk.green.bold("✓ PASS")} ${chalk.dim("—")} No regressions detected\n`;
}

// ─── Comparison Table ──────────────────────────────────────────────────────────

export function renderComparisonTable(verdicts: ComparisonVerdict[]): string {
  const lines: string[] = [];

  lines.push(boxTop("Comparison"));
  lines.push(boxLine(
    `${chalk.bold(pad("Metric", 22))}${chalk.bold(pad("Base", 8))}${chalk.bold(pad("Head", 8))}${chalk.bold(pad("p", 8))}${chalk.bold("Reg?")}`
  ));
  lines.push(boxSep());

  for (const v of verdicts) {
    const reg = v.regression ? chalk.red.bold("YES") : chalk.green("no");
    const baseStr = v.baseRate.toFixed(3);
    const headStr = v.headRate.toFixed(3);
    const pStr = v.pValue.toFixed(4);
    lines.push(boxLine(
      `${pad(v.metric, 22)}${pad(baseStr, 8)}${pad(headStr, 8)}${pad(pStr, 8)}${reg}`
    ));
  }

  lines.push(boxBottom());
  return lines.join("\n");
}

// ─── Live Timer ────────────────────────────────────────────────────────────────

/**
 * Start a live-updating elapsed timer on a single line.
 * Returns a handle with `update(run, total)` and `stop()`.
 */
export function startLiveProgress(): { update: (run: number, total: number) => void; stop: () => void } {
  let startTime = Date.now();
  let currentRun = 1;
  let totalRuns = 1;
  let timer: ReturnType<typeof setInterval> | null = null;

  function draw(): void {
    const elapsed = (Date.now() - startTime) / 1000;
    const line = renderProgressLine(currentRun, totalRuns, elapsed);
    process.stdout.write(`\r\x1B[K${line}`);
  }

  timer = setInterval(draw, 1000);
  draw(); // draw immediately

  return {
    update(run: number, total: number) {
      currentRun = run;
      totalRuns = total;
      startTime = Date.now(); // reset per run
      draw();
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      process.stdout.write("\r\x1B[K"); // clear the progress line
    },
  };
}

// ─── Report Mode ───────────────────────────────────────────────────────────────

export function renderReportHeader(bundlePath: string, recordCount: number): string {
  const lines: string[] = [];
  lines.push(boxTop());
  lines.push(boxLine(chalk.bold("TV App Harness Verification — Report")));
  lines.push(boxLine(`Bundle: ${chalk.cyan(bundlePath)} ${chalk.dim(`(${recordCount} records)`)}`));
  lines.push(boxBottom());
  return lines.join("\n");
}
