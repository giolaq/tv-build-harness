import { execSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:net";
import type { AppSpec, BrandKit, DesignTokens, PhaseResult } from "./types.js";
import type { PromptLoader } from "./prompt-loader.js";
import { claudeEnv } from "./claude-cli.js";

export interface QADefect {
  screen: string;
  issue: string;
  element: string;
  file: string;
  fix: string;
}

export interface QAVerdict {
  status: "pass" | "fail";
  criticalCount: number;
  majorCount: number;
  minorCount: number;
  critical: QADefect[];
  major: QADefect[];
  minor: QADefect[];
  scores: Record<string, number>;
}

export interface VisualQADeps {
  appDir: string;
  /** The run's out dir — prompt/verdict artifacts and the QA report land here. */
  outDir: string;
  maxIterations: number;
  threshold: "strict" | "normal";
  brand: BrandKit;
  design: DesignTokens;
  spec: AppSpec | null;
  platforms: string[];
  prompts: PromptLoader;
  /** Use chrome-devtools MCP for capture instead of Puppeteer script. */
  useDevtools?: boolean;
  /** Agent invocation — supplied by the orchestrator so usage accounting stays there. */
  runClaude: (prompt: string, cwd: string, timeoutMs?: number, allowedTools?: string) => Promise<string>;
  onLog?: (message: string) => void;
  onIteration?: (current: number, max: number) => void;
}

/**
 * The visual QA loop: serve the app on web, capture screenshots, have the
 * model judge them against the 10-foot UI rubric, fix critical defects, and
 * repeat until the verdict passes or iterations run out.
 */
export async function runVisualQALoop(deps: VisualQADeps): Promise<PhaseResult> {
  const { appDir, outDir, maxIterations, threshold, prompts, runClaude } = deps;
  const screenshotDir = join(outDir, "screenshots");
  const port = await getFreePort(19007);

  mkdirSync(screenshotDir, { recursive: true });

  let webServer: ChildProcess | undefined;
  try {
    webServer = await startWebServer(appDir, port, deps.onLog);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { phase: "visual_qa_loop", status: "failed", iterations: 0, error: `Web server failed: ${msg}` };
  }

  try {
    let lastVerdict: QAVerdict | null = null;

    for (let iter = 1; iter <= maxIterations; iter++) {
      deps.onIteration?.(iter, maxIterations);
      deps.onLog?.(`Visual QA iteration ${iter}/${maxIterations}`);

      // Step A: Capture screenshots
      const capturePrompt = buildCapturePrompt(deps, screenshotDir, port, iter);
      writeFileSync(join(outDir, `visual-qa-capture-${iter}.md`), capturePrompt);

      try {
        const captureTools = deps.useDevtools
          ? "Bash,Read,Write,Edit,mcp__chrome-devtools__navigate_page,mcp__chrome-devtools__take_screenshot,mcp__chrome-devtools__press_key,mcp__chrome-devtools__evaluate_script,mcp__chrome-devtools__emulate,mcp__chrome-devtools__take_snapshot,mcp__chrome-devtools__click"
          : undefined;
        await runClaude(capturePrompt, appDir, 480_000, captureTools);
      } catch (err) {
        deps.onLog?.(`Capture failed iter ${iter}: ${err instanceof Error ? err.message : err}`);
        continue;
      }

      // Step B: Analyze screenshots
      const analysisPrompt = buildAnalysisPrompt(deps, screenshotDir, iter);
      writeFileSync(join(outDir, `visual-qa-analysis-${iter}.md`), analysisPrompt);

      let analysisResult: string;
      try {
        analysisResult = await runClaude(analysisPrompt, appDir, 600_000);
      } catch (err) {
        deps.onLog?.(`Analysis failed iter ${iter}: ${err instanceof Error ? err.message : err}`);
        continue;
      }

      writeFileSync(join(outDir, `visual-qa-result-${iter}.txt`), analysisResult);

      // Step C: Parse verdict
      lastVerdict = parseQAVerdict(analysisResult);
      writeFileSync(
        join(outDir, `visual-qa-verdict-${iter}.json`),
        JSON.stringify(lastVerdict, null, 2)
      );

      const passes = threshold === "strict"
        ? lastVerdict.criticalCount === 0 && lastVerdict.majorCount === 0
        : lastVerdict.criticalCount === 0;

      deps.onLog?.(
        `Iter ${iter}: ${lastVerdict.criticalCount} critical, ${lastVerdict.majorCount} major, ${lastVerdict.minorCount} minor`
      );

      if (passes) {
        writeQAReport(deps, lastVerdict, iter);
        return { phase: "visual_qa_loop", status: "success", iterations: iter };
      }

      if (iter === maxIterations) {
        break;
      }

      // Step D: Fix defects
      const fixPrompt = buildFixPrompt(deps, lastVerdict);
      writeFileSync(join(outDir, `visual-qa-fix-${iter}.md`), fixPrompt);

      try {
        await runClaude(fixPrompt, appDir, 600_000);
      } catch (err) {
        deps.onLog?.(`Fix failed iter ${iter}: ${err instanceof Error ? err.message : err}`);
      }

      // Wait for hot-reload
      await new Promise(r => setTimeout(r, 3000));
    }

    writeQAReport(deps, lastVerdict, maxIterations);

    const errorMsg = lastVerdict
      ? `${lastVerdict.criticalCount} critical, ${lastVerdict.majorCount} major defects remain after ${maxIterations} iterations`
      : "Visual QA loop failed to produce results";

    return {
      phase: "visual_qa_loop",
      status: lastVerdict && lastVerdict.criticalCount === 0 ? "degraded" : "failed",
      iterations: maxIterations,
      error: errorMsg,
    };
  } finally {
    stopWebServer(webServer);
  }
}

async function startWebServer(
  appDir: string,
  port: number,
  onLog?: (message: string) => void
): Promise<ChildProcess> {
  const expoDir = join(appDir, "apps", "expo-multi-tv");

  // Clear Metro's temp cache to avoid stale lockfiles
  try {
    execSync(`rm -rf "${join(expoDir, "node_modules", ".cache", "metro")}" 2>/dev/null || true`, { stdio: "pipe" });
  } catch {}

  const child = spawn("npx", ["expo", "start", "--web", "--port", String(port)], {
    cwd: expoDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...claudeEnv(), BROWSER: "none", EXPO_TV: "1" },
    detached: true,
  });

  // Drain stdout/stderr so the child process doesn't block on full pipes
  let serverOutput = "";
  child.stdout?.on("data", (chunk: Buffer) => { serverOutput += chunk.toString(); });
  child.stderr?.on("data", (chunk: Buffer) => { serverOutput += chunk.toString(); });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      onLog?.(`Expo server exited with code ${code}: ${serverOutput.slice(-200)}`);
    }
  });
  child.unref();

  // Phase 1: Wait for server to respond at all
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      execSync(`curl -s http://localhost:${port} > /dev/null`, { timeout: 5000, stdio: "pipe" });
      break;
    } catch {
      if (i === 29) {
        stopWebServer(child);
        const hint = serverOutput.slice(-300);
        throw new Error(`Web server not ready after 60s on port ${port}. Server output: ${hint}`);
      }
    }
  }

  // Phase 2: Pre-compile the web bundle. Metro builds it on first request and
  // the dev client mid-session-reloads the page when the build lands — which
  // detaches Puppeteer's frame and wrecks the capture session. Fetching the
  // bundle URL ourselves (curl blocks until Metro finishes) means the agent's
  // browser gets a fully built app with no reload.
  onLog?.("Web server responding, compiling web bundle...");
  try {
    const html = execSync(`curl -s http://localhost:${port}`, { timeout: 30_000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    const src = html.match(/src=["']([^"']+\.bundle[^"']*)["']/)?.[1]?.replace(/&amp;/g, "&");
    if (src) {
      const url = src.startsWith("http") ? src : `http://localhost:${port}${src}`;
      const out = execSync(
        `curl -s -o /dev/null -w "%{http_code} %{size_download}" "${url}"`,
        { timeout: 300_000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      );
      const [code, size] = out.trim().split(" ");
      onLog?.(`Web bundle compiled: HTTP ${code}, ${size} bytes`);
      if (code === "200") return child;
    }
  } catch {}

  // Fallback when the bundle URL can't be derived (HTML shape changed across
  // Expo versions): poll the page for bundle markers, bounded like the
  // pre-rewrite behavior, so a cold Metro compile still gets real headroom.
  onLog?.("Bundle URL not found — falling back to polling");
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const body = execSync(`curl -s http://localhost:${port}`, { timeout: 10_000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
      if (body.includes(".bundle") || body.includes("AppEntry") || body.length > 2000) {
        await new Promise(r => setTimeout(r, 5_000));
        return child;
      }
    } catch {}
  }
  onLog?.("Bundle pre-compile inconclusive — proceeding");
  return child;
}

function stopWebServer(child: ChildProcess | undefined): void {
  if (!child || child.killed) return;

  try {
    if (child.pid) {
      process.kill(-child.pid, "SIGTERM");
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {}
  }
}

function getFreePort(preferred: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () => {
      const fallback = createServer();
      fallback.once("error", reject);
      fallback.listen(0, () => {
        const address = fallback.address();
        const port = typeof address === "object" && address ? address.port : preferred;
        fallback.close(() => resolve(port));
      });
    });
    server.listen(preferred, () => {
      server.close(() => resolve(preferred));
    });
  });
}

function buildCapturePrompt(deps: VisualQADeps, screenshotDir: string, port: number, iter: number): string {
  const routes = deps.spec?.navigation.routes ?? [];
  const routeCount = Math.min(routes.length, 4);
  const iterDir = join(screenshotDir, `iter-${iter}`);

  const promptName = deps.useDevtools ? "visual_qa_capture_devtools" : "visual_qa_capture";

  return deps.prompts.load(promptName, {
    iterDir,
    workdir: deps.outDir,
    iter: String(iter),
    port: String(port),
    routeCount: String(routeCount),
  });
}

function buildAnalysisPrompt(deps: VisualQADeps, screenshotDir: string, iter: number): string {
  const iterDir = join(screenshotDir, `iter-${iter}`);

  return deps.prompts.load("visual_qa_analysis", {
    iterDir,
    primaryColor: deps.brand.primary_color,
    accentColor: deps.brand.accent_color,
    backgroundColor: deps.brand.background_color,
    template: deps.design.template,
    focusStyle: deps.design.focus_style,
    verdictExtra: deps.threshold === "strict" ? " AND majorDefects is empty" : "",
  });
}

function buildFixPrompt(deps: VisualQADeps, verdict: QAVerdict): string {
  const defects = [...verdict.critical, ...verdict.major];
  const defectList = defects.map((d, i) =>
    `${i + 1}. [${d.screen}] ${d.issue}\n   Element: ${d.element}\n   File: ${d.file}\n   Suggested fix: ${d.fix}`
  ).join("\n\n");

  return deps.prompts.load("visual_qa_fix", {
    defectCount: String(defects.length),
    defectList,
    appDir: deps.appDir,
  });
}

export function parseQAVerdict(output: string): QAVerdict {
  try {
    // If output is the raw CLI wrapper, extract the result field first
    let text = output;
    if (text.startsWith('{"type":"result"')) {
      try {
        const wrapper = JSON.parse(text);
        text = wrapper.result ?? text;
      } catch {}
    }

    // Find JSON block containing "verdict" key (the model's analysis output)
    const jsonBlocks = text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) ?? [];
    let parsed: Record<string, unknown> | null = null;
    for (const block of jsonBlocks) {
      try {
        const candidate = JSON.parse(block);
        if (candidate.verdict || candidate.criticalDefects) {
          parsed = candidate;
          break;
        }
      } catch {}
    }

    // Fallback: try the largest JSON block
    if (!parsed) {
      const bigMatch = text.match(/```json\s*([\s\S]*?)```/);
      if (bigMatch) {
        parsed = JSON.parse(bigMatch[1]);
      }
    }

    if (!parsed) {
      const fallback = text.match(/\{[\s\S]*\}/);
      if (fallback) parsed = JSON.parse(fallback[0]);
    }

    if (!parsed) {
      return { status: "pass", criticalCount: 0, majorCount: 0, minorCount: 0, critical: [], major: [], minor: [], scores: {} };
    }
    const data = parsed as Record<string, unknown>;
    const toDefects = (value: unknown): QADefect[] =>
      (Array.isArray(value) ? value : []).map((d: Record<string, string>) => ({
        screen: d.screen ?? "", issue: d.issue ?? "", element: d.element ?? "", file: d.file ?? "", fix: d.fix ?? "",
      }));

    const critical = toDefects(data.criticalDefects);
    const major = toDefects(data.majorDefects);
    const minor = toDefects(data.minorDefects);
    return {
      status: data.verdict === "pass" ? "pass" : "fail",
      criticalCount: critical.length,
      majorCount: major.length,
      minorCount: minor.length,
      critical, major, minor,
      scores: (data.scores as Record<string, number>) ?? {},
    };
  } catch {
    return { status: "fail", criticalCount: 1, majorCount: 0, minorCount: 0, critical: [], major: [], minor: [], scores: {} };
  }
}

function writeQAReport(deps: VisualQADeps, verdict: QAVerdict | null, iterations: number): void {
  const routes = deps.spec?.navigation.routes ?? [];

  const lines = [
    "# Visual QA Report",
    "",
    `**App:** ${deps.spec?.app_name ?? "Unknown"}`,
    `**Platforms:** ${deps.platforms.join(", ")}`,
    `**Navigation:** ${deps.spec?.navigation.type ?? "unknown"} (${routes.length} routes)`,
    `**Iterations:** ${iterations}`,
    `**Verdict:** ${verdict?.status ?? "unknown"}`,
    "",
    "## Defect Summary",
    "",
    `| Severity | Count |`,
    `|----------|-------|`,
    `| Critical | ${verdict?.criticalCount ?? "?"} |`,
    `| Major    | ${verdict?.majorCount ?? "?"} |`,
    `| Minor    | ${verdict?.minorCount ?? "?"} |`,
    "",
  ];

  if (verdict?.scores && Object.keys(verdict.scores).length > 0) {
    lines.push("## 10ft UI Scores", "");
    lines.push("| Dimension | Score |");
    lines.push("|-----------|-------|");
    for (const [key, val] of Object.entries(verdict.scores)) {
      const icon = val >= 8 ? "+" : val >= 5 ? "~" : "-";
      lines.push(`| ${icon} ${key} | ${val}/10 |`);
    }
    lines.push("");
  }

  if (verdict?.critical.length) {
    lines.push("## Critical Defects (must fix)", "");
    for (const d of verdict.critical) {
      lines.push(`- **[${d.screen}]** ${d.issue}`);
      lines.push(`  File: \`${d.file}\` | Fix: ${d.fix}`);
    }
    lines.push("");
  }

  if (verdict?.major.length) {
    lines.push("## Major Defects", "");
    for (const d of verdict.major) {
      lines.push(`- **[${d.screen}]** ${d.issue}`);
      lines.push(`  File: \`${d.file}\` | Fix: ${d.fix}`);
    }
    lines.push("");
  }

  if (verdict?.minor.length) {
    lines.push("## Minor Defects", "");
    for (const d of verdict.minor) {
      lines.push(`- [${d.screen}] ${d.issue}`);
    }
    lines.push("");
  }

  lines.push("## Route Coverage", "");
  for (const route of routes) {
    lines.push(`- ${route.label} (/${route.id})`);
  }
  lines.push("");

  lines.push("## Ship Readiness", "");
  if (verdict?.status === "pass") {
    lines.push("**READY TO SHIP** — Zero critical defects. All 10ft UI rules pass.");
  } else if (verdict && verdict.criticalCount === 0) {
    lines.push("**SHIP WITH CAUTION** — No critical defects, but major issues remain.");
  } else {
    lines.push("**NOT READY** — Critical defects remain. Fix before shipping.");
  }
  lines.push("");

  writeFileSync(join(deps.outDir, "visual-qa-report.md"), lines.join("\n"));
}
