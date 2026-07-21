import assert from "node:assert/strict";
import test from "node:test";
import { createSkillsPlugin, injectSkillText } from "../model-runtime.js";
import { buildPhasePrompt } from "../steps/04-skills/phase-context.js";
import { loadSkills } from "../steps/04-skills/skills.js";

const skills = loadSkills(["site-foundations", "accessible-focus"]);

test("Claude CLI prompt injection includes full skill instructions", () => {
  const prompt = injectSkillText("Build the site", skills);
  assert.match(prompt, /Skills:/);
  assert.match(prompt, /Keep all three pages linked/);
  assert.match(prompt, /Use `:focus-visible`/);
});

test("Strands AgentSkills receives the selected skills", async () => {
  const plugin = createSkillsPlugin(skills);
  const available = await plugin.getAvailableSkills();
  assert.deepEqual(available.map((skill) => skill.name), ["site-foundations", "accessible-focus"]);
});

test("base phase prompt does not duplicate skill bodies", () => {
  const prompt = buildPhasePrompt(
    { name: "polish", prompt: "Polish it", skills: ["accessible-focus"], verify: { type: "file_exists", path: "out/index.html" } },
    { outDir: "out", summaries: [], costUsd: 0 },
  );
  assert.doesNotMatch(prompt, /Use `:focus-visible`/);
});
