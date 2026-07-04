import { describe, expect, it } from "vitest";
import { checkTemplates } from "../src/template-check.js";
import type { HarnessConfig } from "../src/harness-config.js";

const baseConfig: HarnessConfig = {
  template: {
    repo: "https://example.com/template.git",
    commit: "0123456789abcdef0123456789abcdef01234567",
  },
  models: { plan: "claude-opus-4-6", execution: "claude-sonnet-4-6" },
  vega: {
    ttff_ms_max: 1500,
    ttfd_ms_max: 3000,
    max_hot_function_percent: 20,
    max_js_frame_drop_percent: 2,
    require_builder_tools: false,
  },
  tokenBudget: 500000,
  phases: [],
};

describe("template checks", () => {
  it("reports whether pinned template commits match upstream HEAD", () => {
    const checks = checkTemplates([
      { source: "first", config: baseConfig },
      {
        source: "second",
        config: {
          ...baseConfig,
          template: {
            repo: "https://example.com/other.git",
            commit: "fedcba9876543210fedcba9876543210fedcba98",
          },
        },
      },
    ], (command) => {
      if (command.includes("other.git")) {
        return "1111111111111111111111111111111111111111\tHEAD\n";
      }
      return "0123456789abcdef0123456789abcdef01234567\tHEAD\n";
    });

    expect(checks).toEqual([
      expect.objectContaining({
        source: "first",
        status: "current",
        upstreamHead: "0123456789abcdef0123456789abcdef01234567",
      }),
      expect.objectContaining({
        source: "second",
        status: "behind",
        upstreamHead: "1111111111111111111111111111111111111111",
      }),
    ]);
  });
});
