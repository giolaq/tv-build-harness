import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const courseDir = join("docs", "course");
const prefixes = ["packages/", "docs/", "skills/", "examples/", "scripts/"];
const files = readdirSync(courseDir)
  .filter((file) => file.endsWith(".md"))
  .map((file) => join(courseDir, file));
files.push("AGENTS.md");

const missing: string[] = [];
const forbiddenExerciseCommands: string[] = [];

for (const file of files) {
  const text = readFileSync(file, "utf-8");
  const matches = text.matchAll(/`([^`\n]+)`/g);
  for (const match of matches) {
    const raw = match[1].trim();
    if (!prefixes.some((prefix) => raw.startsWith(prefix))) continue;
    const path = raw.replace(/:\d+$/, "");
    if (!existsSync(path)) missing.push(`${file}: ${raw}`);
  }
  const fences = text.matchAll(/```(?:sh|bash)?\n([\s\S]*?)```/g);
  for (const match of fences) {
    const block = match[1];
    if (/\b(adb|emulator|xcrun|simctl|xcodebuild|maestro)\b/i.test(block)) {
      forbiddenExerciseCommands.push(`${file}: emulator-dependent command in exercise block`);
    }
  }
}

if (missing.length) {
  console.error("Course docs reference missing paths:");
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

if (forbiddenExerciseCommands.length) {
  console.error("Course docs include emulator-dependent exercise commands:");
  for (const item of forbiddenExerciseCommands) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`Checked ${files.length} course docs.`);
