import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AdbtMcpContextProvider, AdbtReplayContextProvider, renderAdbtPrompt, type AdbtToolClient } from "../src/context-providers/adbt.js";

test("discovers ADBT MCP tools before calling the workflow catalog", async () => {
  const fixture = fakeAdbtClient();
  const context = await new AdbtMcpContextProvider({ clientFactory: () => fixture.client, timeoutMs: 2_000 }).load();

  assert.deepEqual(fixture.calls[0], { name: "listTools" });
  assert.deepEqual(fixture.calls[1], {
    name: "list_documents",
    args: { documentType: "WORKFLOW", target_platform: { device_os: ["vega_os"] } },
  });
  assert.deepEqual(new Set(fixture.calls.slice(2, -1).map((call) => (call.args as { document_uri?: string })?.document_uri)), new Set(["port_tv_app_to_vega.md", "port_tv_app_to_vega_fos_rn_app.md"]));
  assert.deepEqual(fixture.calls.at(-1), { name: "disconnect" });
  assert.equal(context.mode, "live");
  assert.equal(context.documents.length, 2);
});

test("disconnects the ADBT MCP client when a required tool is missing", async () => {
  const calls: string[] = [];
  const client: AdbtToolClient = {
    async listTools() { return ["list_documents"]; },
    async callTool() { throw new Error("must not run"); },
    async disconnect() { calls.push("disconnect"); },
  };
  await assert.rejects(() => new AdbtMcpContextProvider({ clientFactory: () => client }).load(), /read_document/);
  assert.deepEqual(calls, ["disconnect"]);
});

test("bounds ADBT MCP discovery and still disconnects", async () => {
  let disconnected = false;
  const client: AdbtToolClient = {
    async listTools() { return new Promise(() => {}); },
    async callTool() { return {}; },
    async disconnect() { disconnected = true; },
  };
  await assert.rejects(() => new AdbtMcpContextProvider({ clientFactory: () => client, timeoutMs: 10 }).load(), /timed out/);
  assert.equal(disconnected, true);
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
  const fixture = fakeAdbtClient();
  return new AdbtMcpContextProvider({ clientFactory: () => fixture.client, timeoutMs: 2_000 }).load();
}

function fakeAdbtClient(): { client: AdbtToolClient; calls: Array<{ name: string; args?: unknown }> } {
  const calls: Array<{ name: string; args?: unknown }> = [];
  const client: AdbtToolClient = {
    async listTools() { calls.push({ name: "listTools" }); return ["list_documents", "read_document", "diagnose_crash"]; },
    async callTool(name, args) {
      calls.push({ name, args });
      if (name === "list_documents") return textResult(JSON.stringify([
        { name: "port_tv_app_to_vega.md" },
        { name: "port_tv_app_to_vega_fos_rn_app.md" },
      ]));
      if (args.document_uri === "port_tv_app_to_vega.md") return textResult("## Purpose\nRoute the app.\n## AI Agent Instructions\nMANDATORY EXECUTION RULES: do not invent APIs.\n## UNRELATED SECTION\nignore");
      return textResult("## Purpose\nPreserve portable JS.\n## Phase 2: PLAN\nMap dependencies.\n## Phase 3: EXECUTE\nUse the template.");
    },
    async disconnect() { calls.push({ name: "disconnect" }); },
  };
  return { client, calls };
}

function textResult(text: string) { return { content: [{ type: "text", text }] }; }
