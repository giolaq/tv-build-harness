import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface Checkpoint {
  runId: string;
  completedPhases: string[];
  updatedAt: string;
}

const CHECKPOINT_FILE = "checkpoint.json";

export function saveCheckpoint(outDir: string, checkpoint: Omit<Checkpoint, "updatedAt">): void {
  const full: Checkpoint = { ...checkpoint, updatedAt: new Date().toISOString() };
  writeFileSync(join(outDir, CHECKPOINT_FILE), JSON.stringify(full, null, 2));
}

export function loadCheckpoint(outDir: string): Checkpoint | null {
  const path = join(outDir, CHECKPOINT_FILE);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    if (typeof parsed.runId !== "string" || !Array.isArray(parsed.completedPhases)) return null;
    return parsed as Checkpoint;
  } catch {
    return null;
  }
}

/**
 * Resolves the out dir to resume: an explicit runId under out/, or the most
 * recently modified run that has a checkpoint.
 */
export function findResumableRun(baseDir: string, runId?: string): string | null {
  const outRoot = join(baseDir, "out");
  if (runId) {
    const dir = join(outRoot, runId);
    return existsSync(join(dir, CHECKPOINT_FILE)) ? dir : null;
  }

  if (!existsSync(outRoot)) return null;
  const candidates = readdirSync(outRoot)
    .map((name) => join(outRoot, name))
    .filter((dir) => existsSync(join(dir, CHECKPOINT_FILE)))
    .map((dir) => ({ dir, mtime: statSync(dir).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  return candidates[0]?.dir ?? null;
}
