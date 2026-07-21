import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ModelSkill } from "../../model-runtime.js";

export type Skill = ModelSkill & { appliesTo: string[] };
const DEFAULT_SKILLS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "skills");

export function loadSkills(names: string[], skillsDir = DEFAULT_SKILLS_DIR): Skill[] {
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
  const description = frontmatter.match(/^description:\s*["']?(.+?)["']?$/m)?.[1]?.trim() ?? `Instructions for ${declared}`;
  const applies = frontmatter.match(/^applies_to:\s*\[?([^\]\n]+)\]?$/m)?.[1]?.split(",").map((s) => s.trim()) ?? [];
  return { name: declared, description, appliesTo: applies, body };
}
