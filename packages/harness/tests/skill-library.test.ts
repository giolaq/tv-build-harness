import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { SkillLibrary } from "../src/skill-library.js";

const TEST_SKILLS_DIR = "/tmp/tv-build-test-skills";
const VALID_SKILL_CONTENT =
  "# Reusable Pattern\n\n" +
  "x".repeat(400) +
  "\n\n## Gotchas\nDo not apply this pattern without checking the phase context.\n\n" +
  "```ts\nconst reusable = true;\n```\n" +
  "y".repeat(100);

beforeEach(() => {
  rmSync(TEST_SKILLS_DIR, { recursive: true, force: true });
  mkdirSync(TEST_SKILLS_DIR, { recursive: true });

  writeFileSync(
    join(TEST_SKILLS_DIR, "meta.md"),
    `---\nname: meta\napplies_to: [all]\n---\n\n# Meta skill\nAlways loaded.`
  );

  writeFileSync(
    join(TEST_SKILLS_DIR, "rn-theming.md"),
    `---\nname: rn-theming\napplies_to: [branding]\n---\n\n# Theming\nBrand tokens.`
  );

  writeFileSync(
    join(TEST_SKILLS_DIR, "rn-template-anatomy.md"),
    `---\nname: rn-template-anatomy\napplies_to: [scaffold, branding]\n---\n\n# Template Anatomy\nMonorepo layout.`
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
    expect(result.suggested).toContain("rn-theming");
  });

  it("createAutoSkill rejects short content", () => {
    const lib = new SkillLibrary(TEST_SKILLS_DIR);
    const result = lib.createAutoSkill("short", { applies_to: ["test"] }, "too short");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("500 characters");
  });

  it("createAutoSkill rejects content without Gotchas section", () => {
    const lib = new SkillLibrary(TEST_SKILLS_DIR);
    const content = "x".repeat(600) + "\n```\ncode example\n```";
    const result = lib.createAutoSkill("test-skill", { applies_to: ["test"] }, content);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Gotchas");
  });

  it("createAutoSkill succeeds with valid content", () => {
    const lib = new SkillLibrary(TEST_SKILLS_DIR);
    const result = lib.createAutoSkill("new-skill", { applies_to: ["test"] }, VALID_SKILL_CONTENT);
    expect(result.ok).toBe(true);

    const loaded = lib.loadOnDemand("new-skill");
    expect(loaded.ok).toBe(true);
    expect(loaded.content).toContain("Gotchas");
  });

  it("loads only auto-skills applicable to the current phase", () => {
    writeAutoSkill("exact-phase", ["branding"], "Exact phase guidance");
    writeAutoSkill("legacy-phase", ["phase_branding"], "Legacy phase guidance");
    writeAutoSkill("all-phases", ["all"], "All phase guidance");
    writeAutoSkill("other-phase", ["content"], "Other phase guidance");

    const lib = new SkillLibrary(TEST_SKILLS_DIR);
    const skills = lib.loadPhaseSkills("branding", []);

    expect(skills.some((skill) => skill.includes("Exact phase guidance"))).toBe(true);
    expect(skills.some((skill) => skill.includes("Legacy phase guidance"))).toBe(true);
    expect(skills.some((skill) => skill.includes("All phase guidance"))).toBe(true);
    expect(skills.some((skill) => skill.includes("Other phase guidance"))).toBe(false);
  });

  it("deduplicates an auto-skill that is also explicitly configured", () => {
    writeAutoSkill("explicit-auto", ["branding"], "Explicit auto guidance");
    const lib = new SkillLibrary(TEST_SKILLS_DIR);

    const metas = lib.getPhaseSkillMetas("branding", ["explicit-auto"]);

    expect(metas.map((meta) => meta.name)).toEqual(["explicit-auto"]);
  });

  it("does not mutate legacy effectiveness counters when loading a skill", () => {
    const autoDir = join(TEST_SKILLS_DIR, "auto");
    const filePath = join(autoDir, "legacy-counters.md");
    mkdirSync(autoDir, { recursive: true });
    writeFileSync(
      filePath,
      "---\nname: legacy-counters\napplies_to: [branding]\nmeta:\n  times_loaded: 0\n  times_defect_recurred: 0\n---\n\n# Legacy counters\n"
    );
    const before = readFileSync(filePath, "utf-8");
    const lib = new SkillLibrary(TEST_SKILLS_DIR);

    lib.loadPhaseSkills("branding", []);

    expect(readFileSync(filePath, "utf-8")).toBe(before);
  });

  it("rejects unsafe names and invalid phase scopes", () => {
    const lib = new SkillLibrary(TEST_SKILLS_DIR);

    expect(
      lib.createAutoSkill("../escape", { applies_to: ["branding"] }, VALID_SKILL_CONTENT)
    ).toMatchObject({ ok: false, error: expect.stringContaining("Skill name") });
    expect(
      lib.createAutoSkill("empty-phases", { applies_to: [] }, VALID_SKILL_CONTENT)
    ).toMatchObject({ ok: false, error: expect.stringContaining("at least one phase") });
    expect(
      lib.createAutoSkill("invalid-phase", { applies_to: ["../branding"] }, VALID_SKILL_CONTENT)
    ).toMatchObject({ ok: false, error: expect.stringContaining("Invalid applies_to") });
  });

  it("refreshes the index so a created skill is immediately phase-selectable", () => {
    const lib = new SkillLibrary(TEST_SKILLS_DIR);

    const result = lib.createAutoSkill(
      "new-branding-pattern",
      { applies_to: ["branding"] },
      VALID_SKILL_CONTENT
    );

    expect(result.ok).toBe(true);
    expect(lib.loadPhaseSkills("branding", []).join("\n")).toContain("# Reusable Pattern");
    expect(lib.listSkills("auto").map((skill) => skill.name)).toContain("new-branding-pattern");
  });

  it("listSkills returns all indexed skills", () => {
    const lib = new SkillLibrary(TEST_SKILLS_DIR);
    const all = lib.listSkills("all");
    expect(all.length).toBe(3);
  });
});

function writeAutoSkill(name: string, appliesTo: string[], marker: string): void {
  const autoDir = join(TEST_SKILLS_DIR, "auto");
  mkdirSync(autoDir, { recursive: true });
  writeFileSync(
    join(autoDir, `${name}.md`),
    `---\nname: ${name}\napplies_to: [${appliesTo.join(", ")}]\n---\n\n# ${marker}\n`
  );
}
