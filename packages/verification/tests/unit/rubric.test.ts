import { describe, expect, it } from "vitest";
import { JUDGE_PROMPT_HASH, buildJudgePrompt, parseJudgeResponse } from "../../src/levels/rubric.js";

describe("rubric judge governance", () => {
  it("exports a stable sha256 prompt hash", () => {
    expect(JUDGE_PROMPT_HASH).toMatch(/^[a-f0-9]{64}$/);
  });

  it("builds the skeptical judge prompt from the rubric definitions", () => {
    const prompt = buildJudgePrompt("/missing/app", "A cooking TV app");
    expect(prompt).toContain("skeptical TV app quality evaluator");
    expect(prompt).toContain("Intent Fidelity");
    expect(prompt).toContain("A cooking TV app");
  });

  it("parses fenced judge JSON responses", () => {
    expect(parseJudgeResponse("```json\n{\"intent\":{\"score\":2},\"layout\":{\"score\":1},\"theme\":{\"score\":2},\"visual\":{\"score\":1}}\n```"))
      .toEqual({ intent: 2, layout: 1, theme: 2, visual: 1 });
  });

  it("parses bare judge JSON responses", () => {
    expect(parseJudgeResponse("{\"intent\":2,\"layout\":1,\"theme\":2,\"visual\":0}"))
      .toEqual({ intent: 2, layout: 1, theme: 2, visual: 0 });
  });
});
