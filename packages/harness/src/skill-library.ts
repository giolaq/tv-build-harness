import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { Phase, SkillMeta } from "./types.js";
import { DEFAULT_PHASE_SKILLS } from "./harness-config.js";

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PHASE_TOKEN_PATTERN = /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*$/;

export class SkillLibrary {
  private skillsDir: string;
  private index: Map<string, SkillMeta> = new Map();
  private loaded: Map<string, string> = new Map();

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
    this.buildIndex();
  }

  private buildIndex(): void {
    this.index.clear();
    this.loaded.clear();

    const scanDir = (dir: string) => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir)) {
        // New format: <name>/SKILL.md
        const skillMdPath = join(dir, entry, "SKILL.md");
        if (existsSync(skillMdPath)) {
          const content = readFileSync(skillMdPath, "utf-8");
          const meta = this.parseFrontmatter(content, skillMdPath);
          if (meta) {
            this.index.set(meta.name, meta);
          }
          continue;
        }
        // Old format: <name>.md (flat file)
        if (!entry.endsWith(".md") || entry === "README.md") continue;
        const filePath = join(dir, entry);
        const content = readFileSync(filePath, "utf-8");
        const meta = this.parseFrontmatter(content, filePath);
        if (meta) {
          this.index.set(meta.name, meta);
        }
      }
    };

    scanDir(this.skillsDir);
    scanDir(join(this.skillsDir, "auto"));
  }

  private parseFrontmatter(content: string, filePath: string): SkillMeta | null {
    // Derive fallback name: if SKILL.md, use parent dir name; otherwise strip .md
    const fallbackName = basename(filePath) === "SKILL.md"
      ? basename(dirname(filePath))
      : basename(filePath, ".md");

    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      return { name: fallbackName, applies_to: [], filePath };
    }

    const frontmatter = match[1];
    const nameMatch = frontmatter.match(/name:\s*(.+)/);
    const appliesMatch = frontmatter.match(/applies_to:\s*\[([^\]]*)\]/);

    return {
      name: nameMatch?.[1]?.trim() ?? fallbackName,
      applies_to: appliesMatch?.[1]?.split(",").map((s) => s.trim()) ?? [],
      filePath,
    };
  }

  alwaysLoad(): string {
    return this.loadSkill("meta");
  }

  loadForPhase(phase: Phase): string[] {
    return this.loadPhaseSkills(phase, DEFAULT_PHASE_SKILLS[phase] ?? []);
  }

  getPhaseSkillMetas(phase: Phase, explicitNames: string[]): SkillMeta[] {
    const selected: SkillMeta[] = [];
    const seen = new Set<string>();

    const add = (meta: SkillMeta | undefined) => {
      if (!meta || seen.has(meta.name)) return;
      selected.push(meta);
      seen.add(meta.name);
    };

    for (const name of explicitNames) {
      add(this.index.get(name));
    }

    const phaseTokens = new Set([phase, `phase_${phase}`, "all"]);
    const matchingAutoSkills = [...this.index.values()]
      .filter((meta) =>
        this.isAutoSkill(meta) &&
        meta.applies_to.some((token) => phaseTokens.has(token))
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const meta of matchingAutoSkills) {
      add(meta);
    }

    return selected;
  }

  loadPhaseSkills(phase: Phase, explicitNames: string[]): string[] {
    return this.getPhaseSkillMetas(phase, explicitNames)
      .map((meta) => this.loadSkill(meta.name))
      .filter((content) => content.length > 0);
  }

  loadSkills(names: string[]): string[] {
    const contents: string[] = [];
    for (const name of names) {
      const content = this.loadSkill(name);
      if (content) contents.push(content);
    }
    return contents;
  }

  loadSkill(name: string): string {
    if (this.loaded.has(name)) {
      return this.loaded.get(name)!;
    }

    const meta = this.index.get(name);
    if (!meta) {
      return "";
    }

    const content = readFileSync(meta.filePath, "utf-8");
    this.loaded.set(name, content);

    return content;
  }

  loadOnDemand(name: string): { ok: boolean; content?: string; error?: string; suggested?: string[] } {
    const meta = this.index.get(name);
    if (!meta) {
      const allNames = [...this.index.keys()];
      const suggested = allNames
        .filter((n) => n.includes(name) || name.includes(n))
        .slice(0, 3);
      return { ok: false, error: "no such skill", suggested };
    }

    const content = this.loadSkill(name);
    return { ok: true, content };
  }

  createAutoSkill(
    name: string,
    frontmatter: { applies_to: string[] },
    content: string
  ): { ok: boolean; error?: string } {
    if (!SKILL_NAME_PATTERN.test(name) || name.length > 64) {
      return {
        ok: false,
        error: "Skill name must be 1-64 lowercase alphanumeric characters separated by single hyphens",
      };
    }
    if (!Array.isArray(frontmatter.applies_to) || frontmatter.applies_to.length === 0) {
      return { ok: false, error: "Skill must apply to at least one phase" };
    }

    const appliesTo = [...new Set(frontmatter.applies_to.map((phase) => phase.trim()))];
    const invalidPhase = appliesTo.find(
      (phase) => phase !== "all" && (!PHASE_TOKEN_PATTERN.test(phase) || phase.length > 64)
    );
    if (invalidPhase !== undefined) {
      return {
        ok: false,
        error: `Invalid applies_to phase "${invalidPhase}". Use "all" or a lowercase phase name`,
      };
    }
    if (content.length < 500) {
      return { ok: false, error: "Skill content must be at least 500 characters" };
    }
    if (!content.includes("## Gotchas") && !content.includes("## Anti-pattern")) {
      return { ok: false, error: "Skill must include a Gotchas or Anti-pattern section" };
    }
    if (!content.includes("```")) {
      return { ok: false, error: "Skill must include at least one code example" };
    }
    if (this.index.has(name)) {
      return { ok: false, error: `Skill "${name}" already exists` };
    }

    const autoDir = join(this.skillsDir, "auto");
    mkdirSync(autoDir, { recursive: true });

    const resolvedAutoDir = resolve(autoDir);
    const filePath = resolve(resolvedAutoDir, `${name}.md`);
    const relativePath = relative(resolvedAutoDir, filePath);
    if (
      relativePath === ".." ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      return { ok: false, error: "Skill path must remain inside the auto-skills directory" };
    }
    if (existsSync(filePath)) {
      return { ok: false, error: `Skill "${name}" already exists` };
    }

    const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const description = title || `Reusable TV app guidance for ${name}`;
    const fullContent = `---
name: ${name}
description: ${JSON.stringify(description)}
applies_to: [${appliesTo.join(", ")}]
---

${content}`;

    writeFileSync(filePath, fullContent, { flag: "wx" });

    this.buildIndex();
    return { ok: true };
  }

  listSkills(scope: "core" | "auto" | "all" = "all"): SkillMeta[] {
    const results: SkillMeta[] = [];
    for (const meta of this.index.values()) {
      if (scope === "all") {
        results.push(meta);
      } else if (scope === "auto" && this.isAutoSkill(meta)) {
        results.push(meta);
      } else if (scope === "core" && !this.isAutoSkill(meta)) {
        results.push(meta);
      }
    }
    return results;
  }

  private isAutoSkill(meta: SkillMeta): boolean {
    const autoDir = resolve(this.skillsDir, "auto");
    const relativePath = relative(autoDir, resolve(meta.filePath));
    return (
      relativePath !== "" &&
      relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`) &&
      !isAbsolute(relativePath)
    );
  }
}
