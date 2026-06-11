import { readFileSync } from "node:fs";
import { join } from "node:path";

export class PromptLoader {
  private promptsDir: string;

  constructor(promptsDir: string) {
    this.promptsDir = promptsDir;
  }

  load(name: string, vars: Record<string, string> = {}): string {
    const filePath = join(this.promptsDir, `${name}.md`);
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
}
