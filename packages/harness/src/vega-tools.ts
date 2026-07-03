import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface VegaToolCheck {
  name: string;
  ok: boolean;
  detail: string;
  optional?: boolean;
  fix?: string;
}

export interface VegaPerfBudget {
  ttff_ms_max: number;
  ttfd_ms_max: number;
  max_hot_function_percent: number;
  max_js_frame_drop_percent: number;
}

export interface VegaReportInput {
  outDir: string;
  appDir?: string;
  checks: VegaToolCheck[];
  budgets?: VegaPerfBudget;
  phaseResults?: Map<string, { status: string; error?: string }>;
}

const BUILDER_TOOLS_PACKAGE = "@amazon-devices/amazon-devices-buildertools-mcp";
const LEGACY_BUILDER_TOOLS_PACKAGE = "@amazon-devices/vega-devtools-mcp";
const KEPLER_CLI_FIX = "npm install -g @amazon-devices/kepler-cli";

export function checkVegaTooling(appDir?: string): VegaToolCheck[] {
  const checks: VegaToolCheck[] = [];

  checks.push(checkKeplerCli());

  checks.push(checkBuilderTools());

  checks.push(checkLegacyBuilderTools());

  if (appDir) {
    const vegaDir = join(appDir, "apps", "vega");
    checks.push({
      name: "Vega app directory",
      ok: existsSync(join(vegaDir, "package.json")),
      detail: existsSync(join(vegaDir, "package.json")) ? vegaDir : "apps/vega/package.json not found",
      fix: "Use a template that includes apps/vega, or disable firetv-vega for this run.",
    });

    const manifestCandidates = [
      join(vegaDir, "manifest.toml"),
      join(vegaDir, "vega.json"),
      join(vegaDir, "manifest.json"),
    ];
    const manifest = manifestCandidates.find((path) => existsSync(path));
    checks.push({
      name: "Vega manifest",
      ok: Boolean(manifest),
      detail: manifest ?? "manifest.toml / vega.json / manifest.json not found",
      fix: "Create or repair the Vega manifest using the amazon-devices-vega-app-manifest skill.",
    });
  }

  checks.push(checkVegaVirtualDevice());

  return checks;
}

export function builderToolsStatus(): string {
  return runBuilderToolsCommand("check-status");
}

export function builderToolsInitContext(agent?: string): string {
  const agentArg = agent ? ` --agent ${shellQuote(agent)}` : "";
  return runBuilderToolsCommand(`init-context${agentArg} --force`);
}

export function expectedBuilderToolsCapabilities(): string {
  return [
    "Expected Amazon Devices Builder Tools MCP capabilities:",
    "- Tools: analyze_perfetto_traces, get_app_hot_functions, search_documentation, symbolicate_acr",
    "- Prompts: detect_component_re-renders, fix_hot_functions",
    "- Skills: amazon-devices-vega-setup-sdk, amazon-devices-vega-build-and-run, amazon-devices-vega-navigation, amazon-devices-vega-focus-management, amazon-devices-vega-media-player, amazon-devices-vega-ui-components, amazon-devices-vega-app-manifest, amazon-devices-vega-app-performance, amazon-devices-vega-best-practices",
  ].join("\n");
}

export function writeVegaReport(input: VegaReportInput): string {
  const lines: string[] = [
    "# Vega Report",
    "",
    `**Generated:** ${new Date().toISOString()}`,
    "",
    "## Tooling",
    "",
    "| Check | Status | Detail |",
    "|-------|--------|--------|",
  ];

  for (const check of input.checks) {
    const status = check.ok ? "PASS" : check.optional ? "WARN" : "FAIL";
    lines.push(`| ${check.name} | ${status} | ${escapeTable(check.detail)} |`);
  }

  if (input.budgets) {
    lines.push("", "## Performance Budgets", "");
    lines.push("| Metric | Budget |");
    lines.push("|--------|--------|");
    lines.push(`| TTFF | <= ${input.budgets.ttff_ms_max} ms |`);
    lines.push(`| TTFD | <= ${input.budgets.ttfd_ms_max} ms |`);
    lines.push(`| Hot function share | <= ${input.budgets.max_hot_function_percent}% |`);
    lines.push(`| JS frame drop | <= ${input.budgets.max_js_frame_drop_percent}% |`);
  }

  if (input.phaseResults?.size) {
    lines.push("", "## Vega Phases", "");
    lines.push("| Phase | Status | Error |");
    lines.push("|-------|--------|-------|");
    for (const [phase, result] of input.phaseResults) {
      if (!phase.includes("vega")) continue;
      lines.push(`| ${phase} | ${result.status} | ${escapeTable(result.error ?? "")} |`);
    }
  }

  lines.push("", "## Builder Tools", "", expectedBuilderToolsCapabilities(), "");

  const path = join(input.outDir, "vega-report.md");
  writeFileSync(path, lines.join("\n"));
  return path;
}

function runBuilderToolsCommand(args: string): string {
  return execSync(`npx -y ${BUILDER_TOOLS_PACKAGE}@latest ${args}`, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 60_000,
  }).trim();
}

function checkCommand(name: string, command: string, fix: string, optional = false): VegaToolCheck {
  try {
    const detail = execSync(command, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30_000,
    }).trim();
    return { name, ok: true, detail: detail.slice(0, 500) || "OK", optional, fix };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const detail = (e.stderr || e.stdout || e.message || "Not available").trim();
    return { name, ok: false, detail: detail.slice(0, 500), optional, fix };
  }
}

function checkKeplerCli(): VegaToolCheck {
  if (!commandExists("kepler")) {
    return {
      name: "Vega Kepler CLI",
      ok: false,
      detail: "kepler command not found on PATH",
      optional: true,
      fix: KEPLER_CLI_FIX,
    };
  }

  return checkCommand(
    "Vega Kepler CLI",
    "kepler --version",
    KEPLER_CLI_FIX,
    true
  );
}

function checkVegaVirtualDevice(): VegaToolCheck {
  if (!commandExists("kepler")) {
    return {
      name: "Vega Virtual Device",
      ok: false,
      detail: "Skipped because kepler command is not on PATH",
      optional: true,
      fix: KEPLER_CLI_FIX,
    };
  }

  return checkCommand(
    "Vega Virtual Device",
    "kepler device list",
    "kepler device start",
    true
  );
}

function checkBuilderTools(): VegaToolCheck {
  const fix = `npx -y ${BUILDER_TOOLS_PACKAGE}@latest init-context`;
  try {
    const detail = runBuilderToolsCommand("check-status");
    if (!isBuilderToolsConfiguredForClaudeCode(detail)) {
      return {
        name: "Amazon Devices Builder Tools",
        ok: false,
        detail: "Installed, but Claude Code MCP/context is not configured",
        optional: true,
        fix,
      };
    }

    return {
      name: "Amazon Devices Builder Tools",
      ok: true,
      detail: detail.slice(0, 500) || "Configured",
      optional: true,
      fix,
    };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const detail = (e.stderr || e.stdout || e.message || "Not available").trim();
    return {
      name: "Amazon Devices Builder Tools",
      ok: false,
      detail: detail.slice(0, 500),
      optional: true,
      fix,
    };
  }
}

export function isBuilderToolsConfiguredForClaudeCode(status: string): boolean {
  const claudeCodeLine = status.split("\n").find((line) => line.includes("Claude Code"));
  return Boolean(claudeCodeLine && !/Not configured|Not found|❌/.test(claudeCodeLine));
}

function commandExists(command: string): boolean {
  try {
    execSync(`command -v ${shellQuote(command)}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

function checkLegacyBuilderTools(): VegaToolCheck {
  const home = process.env.HOME;
  if (!home) {
    return { name: "Legacy Vega DevTools MCP", ok: true, detail: "HOME not set; skipped", optional: true };
  }

  const candidates = [
    join(home, ".claude.json"),
    join(home, ".cursor", "mcp.json"),
    join(home, ".kiro", "settings", "mcp.json"),
  ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const content = execSync(`grep -n ${shellQuote(LEGACY_BUILDER_TOOLS_PACKAGE)} ${shellQuote(path)}`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      if (content.trim()) {
        return {
          name: "Legacy Vega DevTools MCP",
          ok: false,
          detail: `Legacy package referenced in ${path}`,
          optional: true,
          fix: `Remove ${LEGACY_BUILDER_TOOLS_PACKAGE} and configure ${BUILDER_TOOLS_PACKAGE}.`,
        };
      }
    } catch {
      // grep exits non-zero when not found.
    }
  }

  return { name: "Legacy Vega DevTools MCP", ok: true, detail: "No legacy MCP package references found", optional: true };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}
