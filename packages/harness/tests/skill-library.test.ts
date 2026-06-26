import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { SkillLibrary } from "../src/skill-library.js";

const TEST_SKILLS_DIR = "/tmp/tv-build-test-skills";

beforeEach(() => {
  rmSync(TEST_SKILLS_DIR, { recursive: true, force: true });
  mkdirSync(TEST_SKILLS_DIR, { recursive: true });

  writeFileSync(
    join(TEST_SKILLS_DIR, "meta.md"),
    `---\nname: meta\napplies_to: [all]\n---\n\n# Meta skill\nAlways loaded.`
  );

  writeFileSync(
    join(TEST_SKILLS_DIR, "theming.md"),
    `---\nname: theming\napplies_to: [branding]\n---\n\n# Theming\nBrand tokens.`
  );

  writeFileSync(
    join(TEST_SKILLS_DIR, "template-anatomy.md"),
    `---\nname: template-anatomy\napplies_to: [scaffold, branding]\n---\n\n# Template Anatomy\nMonorepo layout.`
  );
});

describe("SkillLibrary", () => {
  it("loads meta skill via alwaysLoad()", () => {
    const lib = new SkillLibrary(TEST_SKILLS_DIR);
    const content = lib.alwaysLoad();
    expect(content).toContain("# Meta skill");
  });

  it("loads skills for a specific phase", () => {
    const lib = new SkillLibrary(TEST_SKILLS_DIR);
    const skills = lib.loadForPhase("branding");
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.some((s) => s.includes("Template Anatomy"))).toBe(true);
    expect(skills.some((s) => s.includes("Theming"))).toBe(true);
  });

  it("returns empty string for nonexistent skill", () => {
    const lib = new SkillLibrary(TEST_SKILLS_DIR);
    const content = lib.loadSkill("nonexistent");
    expect(content).toBe("");
  });

  it("loadOnDemand returns error with suggestions for unknown skill", () => {
    const lib = new SkillLibrary(TEST_SKILLS_DIR);
    const result = lib.loadOnDemand("them");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("no such skill");
    expect(result.suggested).toContain("theming");
  });

  it("createAutoSkill rejects short content", () => {
    const lib = new SkillLibrary(TEST_SKILLS_DIR);
    const result = lib.createAutoSkill("short", { applies_to: [] }, "too short");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("500 characters");
  });

  it("createAutoSkill rejects content without Gotchas section", () => {
    const lib = new SkillLibrary(TEST_SKILLS_DIR);
    const content = "x".repeat(600) + "\n```\ncode example\n```";
    const result = lib.createAutoSkill("test-skill", { applies_to: [] }, content);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Gotchas");
  });

  it("createAutoSkill succeeds with valid content", () => {
    const lib = new SkillLibrary(TEST_SKILLS_DIR);
    const content = "x".repeat(400) + "\n\n## Gotchas\nDon't do this.\n\n```ts\nconst x = 1;\n```\n" + "y".repeat(100);
    const result = lib.createAutoSkill("new-skill", { applies_to: ["test"] }, content);
    expect(result.ok).toBe(true);

    const loaded = lib.loadOnDemand("new-skill");
    expect(loaded.ok).toBe(true);
    expect(loaded.content).toContain("Gotchas");
  });

  it("listSkills returns all indexed skills", () => {
    const lib = new SkillLibrary(TEST_SKILLS_DIR);
    const all = lib.listSkills("all");
    expect(all.length).toBe(3);
  });
});
