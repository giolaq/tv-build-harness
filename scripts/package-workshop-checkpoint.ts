import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const source = resolve(process.argv[2] ?? "");
const target = resolve(process.argv[3] ?? "");
if (!existsSync(source) || !process.argv[3]) {
  console.error("Usage: tsx scripts/package-workshop-checkpoint.ts <source> <target>");
  process.exit(1);
}
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true, filter: (path) => !/[\\/](?:node_modules|\.git)(?:[\\/]|$)|[\\/]\.env(?:\.|[\\/]|$)/.test(path) });
const sourceMetadata = join(target, ".workshop-source.json");
if (existsSync(sourceMetadata)) {
  const metadata = JSON.parse(readFileSync(sourceMetadata, "utf8")) as Record<string, unknown>;
  metadata.source = "<WORKSHOP_SOURCE>";
  writeFileSync(sourceMetadata, JSON.stringify(metadata, null, 2));
}
const files = walk(target).filter((path) => !path.endsWith("CHECKSUMS.json"));
const checksums = Object.fromEntries(files.map((path) => [relative(target, path), createHash("sha256").update(readFileSync(path)).digest("hex")]));
writeFileSync(join(target, "CHECKSUMS.json"), JSON.stringify({ schemaVersion: 1, checksums }, null, 2));

function walk(path: string): string[] {
  return statSync(path).isFile() ? [path] : readdirSync(path).flatMap((entry) => walk(join(path, entry)));
}
