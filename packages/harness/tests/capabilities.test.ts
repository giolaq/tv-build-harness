import { describe, expect, it } from "vitest";
import { EXECUTOR_CAPABILITIES, REQUIRED_EXECUTOR_CAPABILITIES } from "../src/capabilities.js";
import { parseQAVerdict } from "../src/visual-qa.js";

describe("capability and visual QA contracts", () => {
  it("keeps required capabilities on every executor", () => {
    for (const capabilities of Object.values(EXECUTOR_CAPABILITIES)) {
      expect(capabilities).toEqual(expect.arrayContaining([...REQUIRED_EXECUTOR_CAPABILITIES]));
    }
  });

  it("parses a passing visual QA verdict", () => {
    expect(parseQAVerdict(JSON.stringify({ verdict: "pass", criticalDefects: [], majorDefects: [], minorDefects: [], scores: { focus: 9 } })))
      .toMatchObject({ status: "pass", criticalCount: 0, scores: { focus: 9 } });
  });

  it("fails closed on malformed visual QA output", () => {
    expect(parseQAVerdict("```json\n{broken}\n```")).toMatchObject({ status: "fail", criticalCount: 1 });
  });
});
