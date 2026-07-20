import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AdbtCliContextProvider, AdbtReplayContextProvider, renderAdbtPrompt } from "../src/context-providers/adbt.js";

test("calls ADBT workflow catalog before reading port documents", async () => {
  const dir = mkdtempSync(join(tmpdir(), "adbt-context-"));
  const script = join(dir, "fake-adbt.mjs");
  const log = join(dir, "calls.log");
  writeFileSync(script, fakeAdbtScript());
  const provider = new AdbtCliContextProvider({ command: process.execPath, commandArgs: [script, log], timeoutMs: 2_000 });

  const context = await provider.load();
  const calls = readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line));

  assert.equal(calls[0].tool, "list_documents");
  assert.deepEqual(calls[0].args, { documentType: "WORKFLOW", target_platform: { device_os: ["vega_os"] } });
  assert.deepEqual(new Set(calls.slice(1).map((call) => call.args.document_uri)), new Set(["port_tv_app_to_vega.md", "port_tv_app_to_vega_fos_rn_app.md"]));
  assert.equal(context.mode, "live");
  assert.equal(context.documents.length, 2);
});

test("renders ADBT source names, hashes, and relevant guidance", async () => {
  const context = await liveFixture();
  const prompt = renderAdbtPrompt(context);
  assert.match(prompt, /port_tv_app_to_vega\.md \(sha256:/);
  assert.match(prompt, /MANDATORY EXECUTION RULES/);
  assert.match(prompt, /Preserve portable JS/);
  assert.doesNotMatch(prompt, /UNRELATED SECTION/);
});

test("replay provider validates the recorded ADBT context", async () => {
  const dir = mkdtempSync(join(tmpdir(), "adbt-replay-"));
  const path = join(dir, "adbt.json");
  const context = await liveFixture();
  writeFileSync(path, JSON.stringify({ ...context, mode: "replay" }));
  assert.equal((await new AdbtReplayContextProvider(path).load()).mode, "replay");
  writeFileSync(path, JSON.stringify({ ...context, mode: "replay", documents: [{ ...context.documents[0], excerpt: "changed" }] }));
  await assert.rejects(() => new AdbtReplayContextProvider(path).load(), /hash mismatch/);
  writeFileSync(path, JSON.stringify({ schemaVersion: 2 }));
  await assert.rejects(() => new AdbtReplayContextProvider(path).load());
});

async function liveFixture() {
  const dir = mkdtempSync(join(tmpdir(), "adbt-live-"));
  const script = join(dir, "fake-adbt.mjs");
  writeFileSync(script, fakeAdbtScript());
  return new AdbtCliContextProvider({ command: process.execPath, commandArgs: [script, join(dir, "calls.log")], timeoutMs: 2_000 }).load();
}

function fakeAdbtScript(): string {
  return `import { appendFileSync } from "node:fs";
const [log, verb, tool, marker, raw] = process.argv.slice(2);
const args = JSON.parse(raw);
appendFileSync(log, JSON.stringify({ verb, tool, args }) + "\\n");
if (tool === "list_documents") {
  process.stdout.write(JSON.stringify([
    { name: "port_tv_app_to_vega.md" },
    { name: "port_tv_app_to_vega_fos_rn_app.md" }
  ]));
} else if (args.document_uri === "port_tv_app_to_vega.md") {
  process.stdout.write("## Purpose\\nRoute the app.\\n## AI Agent Instructions\\nMANDATORY EXECUTION RULES: do not invent APIs.\\n## UNRELATED SECTION\\nignore");
} else {
  process.stdout.write("## Purpose\\nPreserve portable JS.\\n## Phase 2: PLAN\\nMap dependencies.\\n## Phase 3: EXECUTE\\nUse the template.");
}`;
}
