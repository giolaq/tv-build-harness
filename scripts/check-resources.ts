import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { DEFAULT_PHASES } from "../packages/harness/src/harness-config.js";

const root = resolve(import.meta.dirname, "..");
const missing: string[] = [];
for (const phase of DEFAULT_PHASES) {
  if (phase.prompt && !existsSync(join(root, "packages", "harness", "prompts", `${phase.prompt}.md`))) {
    missing.push(`prompt ${phase.prompt} for phase ${phase.name}`);
  }
  for (const skill of phase.skills) {
    const path = join(root, "skills", skill, "SKILL.md");
    if (!existsSync(path)) missing.push(`skill ${skill} for phase ${phase.name}`);
    else {
      const source = readFileSync(path, "utf-8");
      if (!source.startsWith("---\n") || !source.includes(`name: ${skill}`) || !source.includes("applies_to:")) {
        missing.push(`invalid frontmatter in ${path}`);
      }
    }
  }
}
if (missing.length) {
  console.error(missing.join("\n"));
  process.exit(1);
}
console.log(`Validated ${DEFAULT_PHASES.length} phase resource references.`);
