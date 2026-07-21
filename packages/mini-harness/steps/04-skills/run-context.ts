import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type RunContext = { outDir: string; summaries: string[]; costUsd: number };

export function createRunContext(resume: boolean): RunContext {
  const outDir = resolve("out");
  if (!resume) rmSync(outDir, { recursive: true, force: true });
  if (!resume) cpSync(resolve("fixtures/react-native-app"), outDir, { recursive: true });
  else mkdirSync(outDir, { recursive: true });
  if (!resume) initGit(outDir);
  return { outDir, summaries: [], costUsd: 0 };
}

export function writeFiles(ctx: RunContext, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    const full = resolve(path);
    if (!full.startsWith(ctx.outDir)) throw new Error(`Refusing to write outside ./out: ${path}`);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

export function commitPhase(ctx: RunContext, phase: string): void {
  execSync("git add -A", { cwd: ctx.outDir });
  execSync("git commit --allow-empty -m " + JSON.stringify(`mini-harness: ${phase}`), { cwd: ctx.outDir, stdio: "ignore" });
}

export function writeReport(ctx: RunContext): void {
  writeFileSync(join(ctx.outDir, "report.md"), ["# Mini Harness Report", "", ...ctx.summaries].join("\n"));
}

function initGit(dir: string): void {
  execSync("git init", { cwd: dir, stdio: "ignore" });
  execSync("git config user.email mini-harness@example.invalid", { cwd: dir });
  execSync("git config user.name mini-harness", { cwd: dir });
}
