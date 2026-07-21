import assert from "node:assert/strict";
import test from "node:test";
import { createSkillsPlugin, injectSkillText } from "../model-runtime.js";
import { buildPhasePrompt } from "../steps/04-skills/phase-context.js";
import { loadSkills } from "../steps/04-skills/skills.js";

const skills = loadSkills(["react-native-screen", "tv-focus"]);

test("Claude CLI prompt injection includes full skill instructions", () => {
  const prompt = injectSkillText("Modify the app", skills);
  assert.match(prompt, /Skills:/);
  assert.match(prompt, /Reuse React Native primitives/);
  assert.match(prompt, /Use React Native focus events/);
});

test("Strands AgentSkills receives the selected skills", async () => {
  const plugin = createSkillsPlugin(skills);
  const available = await plugin.getAvailableSkills();
  assert.deepEqual(available.map((skill) => skill.name), ["react-native-screen", "tv-focus"]);
});

test("base phase prompt does not duplicate skill bodies", () => {
  const prompt = buildPhasePrompt(
    { name: "focus", prompt: "Add TV focus", skills: ["tv-focus"], verify: { type: "file_exists", path: "out/src/App.tsx" } },
    { outDir: "out", summaries: [], costUsd: 0 },
  );
  assert.doesNotMatch(prompt, /Use React Native focus events/);
});
