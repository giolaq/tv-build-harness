import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Checkpoint = { nextPhase: number; summaries: string[]; costUsd: number };

export function readCheckpoint(outDir: string): Checkpoint | null {
  const path = join(outDir, "checkpoint.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : null;
}

export function writeCheckpoint(outDir: string, checkpoint: Checkpoint): void {
  writeFileSync(join(outDir, "checkpoint.json"), JSON.stringify(checkpoint, null, 2));
}
