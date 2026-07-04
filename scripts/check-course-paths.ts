import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const courseDir = join("docs", "course");
const prefixes = ["packages/", "docs/", "skills/", "examples/", "scripts/"];
const files = readdirSync(courseDir)
  .filter((file) => file.endsWith(".md"))
  .map((file) => join(courseDir, file));

const missing: string[] = [];

for (const file of files) {
  const text = readFileSync(file, "utf-8");
  const matches = text.matchAll(/`([^`\n]+)`/g);
  for (const match of matches) {
    const raw = match[1].trim();
    if (!prefixes.some((prefix) => raw.startsWith(prefix))) continue;
    const path = raw.replace(/:\d+$/, "");
    if (!existsSync(path)) missing.push(`${file}: ${raw}`);
  }
}

if (missing.length) {
  console.error("Course docs reference missing paths:");
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`Checked ${files.length} course docs.`);
