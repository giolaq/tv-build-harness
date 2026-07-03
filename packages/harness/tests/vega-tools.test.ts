import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expectedBuilderToolsCapabilities, isBuilderToolsConfiguredForClaudeCode, writeVegaReport } from "../src/vega-tools.js";

describe("vega tools helpers", () => {
  it("documents expected Amazon Devices Builder Tools capabilities", () => {
    const text = expectedBuilderToolsCapabilities();
    expect(text).toContain("analyze_perfetto_traces");
    expect(text).toContain("get_app_hot_functions");
    expect(text).toContain("search_documentation");
    expect(text).toContain("symbolicate_acr");
  });

  it("detects whether Builder Tools is configured for Claude Code", () => {
    expect(isBuilderToolsConfiguredForClaudeCode("Claude Code      │ ✅ Found │ ✅ Configured")).toBe(true);
    expect(isBuilderToolsConfiguredForClaudeCode("Claude Code      │ ❌ Not found │ ❌ Not configured")).toBe(false);
    expect(isBuilderToolsConfiguredForClaudeCode("Cursor           │ ✅ Found │ ✅ Configured")).toBe(false);
  });

  it("writes a Vega report with budgets and phase results", () => {
    const dir = mkdtempSync(join(tmpdir(), "tv-build-vega-report-"));
    try {
      const path = writeVegaReport({
        outDir: dir,
        checks: [{ name: "Builder Tools", ok: true, detail: "Configured" }],
        budgets: {
          ttff_ms_max: 1200,
          ttfd_ms_max: 2400,
          max_hot_function_percent: 12,
          max_js_frame_drop_percent: 1,
        },
        phaseResults: new Map([
          ["vega_build_loop", { status: "success" }],
          ["build_loop", { status: "success" }],
        ]),
      });

      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, "utf-8");
      expect(content).toContain("TTFF");
      expect(content).toContain("1200 ms");
      expect(content).toContain("vega_build_loop");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
