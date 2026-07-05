import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const TEXT_EXTENSIONS = new Set([".json", ".md", ".txt", ".log", ".yml", ".yaml", ".js", ".ts"]);

export function scrubText(input: string): string {
  let text = input;
  text = text.replace(/\/Users\/[^/\s"'`]+/g, "<HOME>");
  text = text.replace(/\/home\/[^/\s"'`]+/g, "<HOME>");
  text = text.replace(/\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, "<REDACTED_ANTHROPIC_KEY>");
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/g, "Bearer <REDACTED_TOKEN>");
  text = text.replace(/\bghp_[A-Za-z0-9]{20,}\b/g, "<REDACTED_GITHUB_TOKEN>");
  text = text.replace(/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, "<REDACTED_AWS_ACCESS_KEY>");
  text = text.replace(
    /^([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*=)(["']?)([A-Za-z0-9_./+=-]{24,})\2$/gm,
    "$1<REDACTED_SECRET>"
  );
  return text;
}

export function scrubPaths(paths: string[], checkOnly = false): string[] {
  const changed: string[] = [];
  for (const file of paths.flatMap((path) => collectFiles(path))) {
    if (!TEXT_EXTENSIONS.has(extname(file))) continue;
    const before = readFileSync(file, "utf-8");
    const after = scrubText(before);
    if (after !== before) {
      changed.push(file);
      if (!checkOnly) writeFileSync(file, after);
    }
  }
  return changed;
}

function collectFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  const files: string[] = [];
  for (const entry of readdirSync(path)) {
    files.push(...collectFiles(join(path, entry)));
  }
  return files;
}

function main(): void {
  const checkOnly = process.argv.includes("--check");
  const paths = process.argv.slice(2).filter((arg) => arg !== "--check");
  if (paths.length === 0) {
    console.error("Usage: tsx scripts/scrub.ts [--check] <path...>");
    process.exit(1);
  }
  const changed = scrubPaths(paths, checkOnly);
  if (changed.length > 0) {
    const action = checkOnly ? "would redact" : "redacted";
    console.error(`Scrub ${action} ${changed.length} file(s):`);
    for (const file of changed) console.error(`- ${file}`);
    if (checkOnly) process.exit(1);
  } else {
    console.log("No secrets or local paths found.");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
