import { describe, expect, it } from "vitest";
import { scrubText } from "../../../scripts/scrub.js";

describe("scrubText", () => {
  it("redacts API tokens and local home paths", () => {
    const input = [
      "/Users/alex/project/out/recording.json",
      "/home/runner/work/demo",
      "sk-ant-abcdefghijklmnopqrstuvwxyz123456",
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz1234567890",
      "ghp_abcdefghijklmnopqrstuvwxyz1234567890ABCD",
      "AKIA1234567890ABCDEF",
      "ANTHROPIC_API_KEY=abcdefghijklmnopqrstuvwxyz123456",
    ].join("\n");

    const output = scrubText(input);

    expect(output).not.toContain("/Users/alex");
    expect(output).not.toContain("/home/runner");
    expect(output).not.toContain("sk-ant-abcdefghijklmnopqrstuvwxyz123456");
    expect(output).not.toContain("Bearer abcdefghijklmnopqrstuvwxyz1234567890");
    expect(output).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz1234567890ABCD");
    expect(output).not.toContain("AKIA1234567890ABCDEF");
    expect(output).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
    expect(output).toContain("<HOME>");
    expect(output).toContain("<REDACTED_SECRET>");
  });

  it("does not redact prose or short placeholders", () => {
    const input = [
      "Use the sk-ant- prefix when documenting token shapes.",
      "ANTHROPIC_API_KEY=replace-me",
      "Bearer token",
    ].join("\n");

    expect(scrubText(input)).toBe(input);
  });
});
