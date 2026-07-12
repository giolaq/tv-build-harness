import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type Skill = { name: string; appliesTo: string[]; body: string };

export function loadSkills(names: string[], skillsDir = "skills"): Skill[] {
  return names.map((name) => loadSkill(name, skillsDir)).filter((skill): skill is Skill => Boolean(skill));
}

function loadSkill(name: string, skillsDir: string): Skill | null {
  const path = resolve(skillsDir, name, "SKILL.md");
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf-8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const frontmatter = match?.[1] ?? "";
  const body = match?.[2] ?? raw;
  const declared = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? name;
  const applies = frontmatter.match(/^applies_to:\s*(.+)$/m)?.[1]?.split(",").map((s) => s.trim()) ?? [];
  return { name: declared, appliesTo: applies, body };
}
