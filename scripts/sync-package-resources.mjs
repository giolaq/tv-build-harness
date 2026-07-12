import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "packages", "harness", "resources");
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(join(root, "skills"), join(target, "skills"), { recursive: true });
cpSync(join(root, "examples", "cooking-shows"), join(target, "examples", "cooking-shows"), { recursive: true });
cpSync(join(root, "docs", "course", "fixtures", "cooking-shows"), join(target, "fixtures", "cooking-shows"), { recursive: true });
writeFileSync(join(target, "manifest.json"), JSON.stringify({
  schemaVersion: 1,
  skills: "built-in",
  examples: ["cooking-shows"],
  fixtures: ["cooking-shows"],
}, null, 2));
