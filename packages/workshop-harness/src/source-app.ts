import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const EXCLUDED = new Set(["node_modules", ".git", ".env", ".env.local", "build", "dist", ".gradle", ".kepler", "coverage"]);

export type SourceDiscovery = {
  source: string;
  name: string;
  scripts: Record<string, string>;
  dependencies: string[];
  hasGit: boolean;
  ignored: string[];
};

export function discoverSource(path: string): SourceDiscovery {
  const source = resolve(path);
  const packagePath = join(source, "package.json");
  if (!existsSync(packagePath) || !statSync(source).isDirectory()) throw new Error(`Not a JavaScript project: ${source}`);
  const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as { name?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  return {
    source,
    name: pkg.name ?? basename(source),
    scripts: pkg.scripts ?? {},
    dependencies: Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).sort(),
    hasGit: existsSync(join(source, ".git")),
    ignored: [...EXCLUDED],
  };
}

export function copySource(sourcePath: string, targetPath: string): SourceDiscovery {
  const discovery = discoverSource(sourcePath);
  const target = resolve(targetPath);
  mkdirSync(target, { recursive: true });
  cpSync(discovery.source, target, {
    recursive: true,
    filter: (path) => !EXCLUDED.has(basename(path)) && !basename(path).startsWith(".env."),
  });
  writeFileSync(join(target, ".workshop-source.json"), JSON.stringify({ schemaVersion: 1, ...discovery }, null, 2));
  return discovery;
}
