import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join("docs", "workshops", "agent-harness-react-native");
const files = walk(root).filter((path) => path.endsWith(".md") && !path.endsWith("IMPLEMENTATION_PLAN.md") && !path.endsWith("CODEX_IMPLEMENTATION_PLAN.md"));
const missing: string[] = [];
const android: string[] = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/`((?:packages|docs|apps|scripts)\/[^`\n]+)`/g)) {
    const path = match[1].replace(/:\d+$/, "").replace(/[.,;:]$/, "");
    if (!path.includes("<") && !existsSync(path)) missing.push(`${file}: ${path}`);
  }
  if (/\b(Android lane|Android CLI lab|Gradle lab)\b/i.test(text)) android.push(file);
}

if (missing.length || android.length) {
  for (const item of missing) console.error(`Missing path: ${item}`);
  for (const item of android) console.error(`Forbidden Android workshop path: ${item}`);
  process.exit(1);
}
console.log(`Checked ${files.length} workshop documents.`);

function walk(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((entry) => walk(join(path, entry)));
}
