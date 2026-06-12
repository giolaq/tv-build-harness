import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export class PromptLoader {
  private promptDirs: string[];

  constructor(promptDirs: string | string[]) {
    this.promptDirs = Array.isArray(promptDirs) ? promptDirs : [promptDirs];
  }

  load(name: string, vars: Record<string, string> = {}): string {
    const filePath = this.resolve(name);
    if (!filePath) {
      throw new Error(`Prompt "${name}" not found in: ${this.promptDirs.join(", ")}`);
    }
    let content = readFileSync(filePath, "utf-8");

    content = content.replace(
      /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_, key, block) => vars[key] ? block : ""
    );

    content = content.replace(
      /\{\{(\w+)\}\}/g,
      (_, key) => vars[key] ?? ""
    );

    return content;
  }

  has(name: string): boolean {
    return this.resolve(name) !== null;
  }

  private resolve(name: string): string | null {
    for (const dir of this.promptDirs) {
      const filePath = join(dir, `${name}.md`);
      if (existsSync(filePath)) return filePath;
    }
    return null;
  }
}
