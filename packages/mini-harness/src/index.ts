#!/usr/bin/env node

import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

type RecordedTurn = {
  timestamp: string;
  phase: string;
  request: { model: string; system: string; messages: unknown[] };
  response: unknown;
  usage: { input_tokens: number; output_tokens: number };
};

const VerifySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("file_exists"), path: z.string() }),
  z.object({ type: z.literal("grep"), path: z.string(), pattern: z.string() }),
]);
const PhaseSchema = z.object({ name: z.string(), prompt: z.string(), verify: VerifySchema });
const PhasesSchema = z.object({ phases: z.array(PhaseSchema).min(1) });
type Phase = z.infer<typeof PhaseSchema>;
type ModelOutput = { summary: string; files: Record<string, string> };

const args = process.argv.slice(2);
const phasesPath = flag("--phases") ?? "phases.json";
const replayPath = flag("--replay");
const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
const root = resolve(".");
const outDir = resolve(root, "out");
const turns: RecordedTurn[] = replayPath ? JSON.parse(readFileSync(resolve(replayPath), "utf-8")) : [];

async function main(): Promise<void> {
  const phases = PhasesSchema.parse(JSON.parse(readFileSync(resolve(phasesPath), "utf-8"))).phases;
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  initGit(outDir);

  const report: string[] = ["# Mini Harness Report", ""];
  let priorSummary = "No prior phase has run.";

  for (const phase of phases) {
    const result = await runPhase(phase, priorSummary);
    priorSummary = result.summary;
    report.push(`## ${phase.name}`, "", result.summary, "");
  }

  writeFileSync(join(outDir, "report.md"), report.join("\n"));
  console.log(`Wrote ${join(outDir, "report.md")}`);
}

async function runPhase(phase: Phase, priorSummary: string): Promise<ModelOutput> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt = buildPrompt(phase, priorSummary, attempt === 2 ? lastFailure : "");
    const raw = await callModelOrReplay(phase.name, prompt);
    const output = parseModelOutput(raw);
    writeFiles(output.files);
    const failure = verify(phase.verify);
    if (!failure) {
      commitPhase(phase.name);
      return output;
    }
    lastFailure = failure;
  }
  throw new Error(`Phase ${phase.name} failed after retry: ${lastFailure}`);
}

let replayIndex = 0;
let lastFailure = "";

async function callModelOrReplay(phase: string, prompt: string): Promise<string> {
  if (replayPath) {
    const turn = turns[replayIndex++];
    if (!turn) throw new Error(`Replay exhausted before phase ${phase}`);
    if (turn.phase !== phase) throw new Error(`Replay phase mismatch: wanted ${phase}, got ${turn.phase}`);
    return responseText(turn.response);
  }

  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY or pass --replay <recording.json>");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model,
    max_tokens: 4096,
    system: "Return only JSON: {\"summary\":\"...\",\"files\":{\"out/path\":\"file contents\"}}.",
    messages: [{ role: "user", content: prompt }],
  });
  const text = message.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
  recordTurn(phase, prompt, text, message.usage);
  return text;
}

function buildPrompt(phase: Phase, priorSummary: string, failure: string): string {
  return [
    `Phase: ${phase.name}`,
    `Prior summary: ${priorSummary}`,
    failure ? `Previous verification failed: ${failure}` : "",
    "Generate or update a three-page static site in ./out.",
    "Pages expected by the fixture are index.html, shows.html, and about.html.",
    "Output only JSON with summary and files.",
    phase.prompt,
  ].filter(Boolean).join("\n\n");
}

function parseModelOutput(text: string): ModelOutput {
  const json = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  const parsed = z.object({ summary: z.string(), files: z.record(z.string(), z.string()) }).parse(JSON.parse(json));
  return parsed;
}

function writeFiles(files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    const full = resolve(root, path);
    if (!full.startsWith(outDir)) throw new Error(`Refusing to write outside ./out: ${path}`);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

function verify(check: Phase["verify"]): string | null {
  const path = resolve(root, check.path);
  if (!path.startsWith(outDir)) return `Verify path must be under ./out: ${check.path}`;
  if (!existsSync(path)) return `Missing file: ${check.path}`;
  if (check.type === "grep" && !readFileSync(path, "utf-8").includes(check.pattern)) {
    return `Pattern "${check.pattern}" not found in ${check.path}`;
  }
  return null;
}

function initGit(dir: string): void {
  execSync("git init", { cwd: dir, stdio: "ignore" });
  execSync("git config user.email mini-harness@example.invalid", { cwd: dir });
  execSync("git config user.name mini-harness", { cwd: dir });
}

function commitPhase(phase: string): void {
  execSync("git add -A", { cwd: outDir });
  execSync(`git commit -m "mini-harness: ${phase}"`, { cwd: outDir, stdio: "ignore" });
}

function responseText(response: unknown): string {
  if (typeof response === "string") return response;
  if (Array.isArray(response)) {
    for (const event of response) {
      const result = event && typeof event === "object" ? (event as { result?: unknown }).result : undefined;
      if (typeof result === "string") return result;
    }
  }
  throw new Error("Replay response did not contain text");
}

function recordTurn(phase: string, prompt: string, response: string, usage: { input_tokens: number; output_tokens: number }): void {
  const path = join(outDir, "recording.json");
  const existing = existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) as RecordedTurn[] : [];
  existing.push({
    timestamp: new Date().toISOString(),
    phase,
    request: { model, system: "mini-harness", messages: [{ role: "user", content: prompt }] },
    response: [{ type: "result", result: response }],
    usage,
  });
  writeFileSync(path, JSON.stringify(existing, null, 2));
}

function flag(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
