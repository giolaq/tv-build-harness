import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import type { Phase, SkillMeta } from "./types.js";

const PHASE_SKILL_MAP: Record<Phase, string[]> = {
  plan: [],
  clone_template: ["template-anatomy", "rntv-project-setup"],
  metadata_branding: ["template-anatomy", "theming", "firetv-leanback"],
  manifest_wiring: ["template-anatomy", "manifest-wiring"],
  screen_customization: ["template-anatomy", "shared-ui-catalog", "rntv-focus-navigation", "10ft-ui"],
  navigation_update: ["template-anatomy", "shared-ui-catalog"],
  prebuild: ["rntv-build-config", "firetv-leanback"],
  static_checks: ["rntv-focus-navigation", "rntv-platform-detection"],
  simulator_build: ["rntv-build-config"],
  vega_build: ["vega-sdk"],
  visual_smoke_test: ["10ft-ui", "rntv-third-party"],
  eas_build: ["eas-build"],
  package: [],
};

export class SkillLibrary {
  private skillsDir: string;
  private index: Map<string, SkillMeta> = new Map();
  private loaded: Map<string, string> = new Map();

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
    this.buildIndex();
  }

  private buildIndex(): void {
    const scanDir = (dir: string) => {
      if (!existsSync(dir)) return;
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".md") || file === "README.md") continue;
        const filePath = join(dir, file);
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
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      const name = basename(filePath, ".md");
      return { name, applies_to: [], filePath };
    }

    const frontmatter = match[1];
    const nameMatch = frontmatter.match(/name:\s*(.+)/);
    const appliesMatch = frontmatter.match(/applies_to:\s*\[([^\]]*)\]/);

    return {
      name: nameMatch?.[1]?.trim() ?? basename(filePath, ".md"),
      applies_to: appliesMatch?.[1]?.split(",").map((s) => s.trim()) ?? [],
      filePath,
    };
  }

  alwaysLoad(): string {
    return this.loadSkill("meta");
  }

  loadForPhase(phase: Phase): string[] {
    const skillNames = PHASE_SKILL_MAP[phase] ?? [];
    const contents: string[] = [];

    for (const name of skillNames) {
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

    const fullContent = `---
name: ${name}
applies_to: [${frontmatter.applies_to.join(", ")}]
---

${content}`;

    const filePath = join(autoDir, `${name}.md`);
    writeFileSync(filePath, fullContent);

    this.index.set(name, { name, applies_to: frontmatter.applies_to, filePath });
    return { ok: true };
  }

  listSkills(scope: "core" | "auto" | "all" = "all"): SkillMeta[] {
    const results: SkillMeta[] = [];
    for (const meta of this.index.values()) {
      if (scope === "all") {
        results.push(meta);
      } else if (scope === "auto" && meta.filePath.includes("/auto/")) {
        results.push(meta);
      } else if (scope === "core" && !meta.filePath.includes("/auto/")) {
        results.push(meta);
      }
    }
    return results;
  }
}
