#!/usr/bin/env node
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { callLiveModel } from "../../model-runtime.js";

type RecordedTurn = { phase: string; response: unknown; usage?: { input_tokens: number; output_tokens: number } };
const Phase = z.object({ name: z.string(), prompt: z.string() });
const Config = z.object({ phases: z.array(Phase).min(1) });
const Output = z.object({ summary: z.string(), files: z.record(z.string(), z.string()) });

const args = process.argv.slice(2);
const phasesPath = args[0] === "run" ? args[1] : flag("--phases") ?? args[0] ?? "fixtures/phases.json";
const replayPath = flag("--replay");
const outDir = resolve("out");
let replayIndex = 0;
const turns: RecordedTurn[] = replayPath ? JSON.parse(readFileSync(resolve(replayPath), "utf-8")) : [];

async function main() {
  const config = Config.parse(JSON.parse(readFileSync(resolve(phasesPath), "utf-8")));
  rmSync(outDir, { recursive: true, force: true });
  cpSync(resolve("fixtures/react-native-app"), outDir, { recursive: true });
  for (const phase of config.phases) {
    const text = await call(phase.name, `Phase: ${phase.name}\n\n${phase.prompt}`);
    const output = Output.parse(JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text));
    for (const [path, content] of Object.entries(output.files)) writeFile(path, content);
    console.log(`${phase.name}: ${output.summary}`);
  }
  console.log(`Wrote ${outDir}`);
}

async function call(phase: string, prompt: string): Promise<string> {
  if (replayPath) return responseText(nextTurn(phase).response);
  return (await callLiveModel(prompt)).text;
}

function writeFile(path: string, content: string) {
  const full = resolve(path);
  if (!full.startsWith(outDir)) throw new Error(`Refusing to write outside ./out: ${path}`);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function nextTurn(phase: string): RecordedTurn {
  const turn = turns[replayIndex++];
  if (!turn) throw new Error(`Replay exhausted before ${phase}`);
  if (turn.phase !== phase) throw new Error(`Replay phase mismatch: wanted ${phase}, got ${turn.phase}`);
  return turn;
}

function responseText(response: unknown): string {
  if (typeof response === "string") return response;
  for (const event of Array.isArray(response) ? response : []) {
    const result = event && typeof event === "object" ? (event as { result?: unknown }).result : undefined;
    if (typeof result === "string") return result;
  }
  throw new Error("Replay response did not contain text");
}

function flag(name: string) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1); });
