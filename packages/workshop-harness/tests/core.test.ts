import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditSource, summarize } from "../src/portability-audit.js";
import { applyProposal, loadMemory, loadSnapshot, propose, renderMemory, snapshotHash } from "../src/project-memory.js";
import { copySource, discoverSource } from "../src/source-app.js";
import { assembleProjectContext } from "../src/phase-context.js";

function temp(): string { return mkdtempSync(join(tmpdir(), "workshop-harness-")); }

function app(root = temp()): string {
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "my app", dependencies: { "react-native": "1", "react-native-camera": "1" }, scripts: { test: "test" } }));
  writeFileSync(join(root, "workshop-brief.md"), "# Brief");
  writeFileSync(join(root, ".env"), "SECRET=do-not-copy");
  mkdirSync(join(root, "node_modules"));
  writeFileSync(join(root, "node_modules", "cache"), "no");
  return root;
}

test("discovers scripts and dependencies", () => {
  const result = discoverSource(app());
  assert.equal(result.name, "my app");
  assert.equal(result.scripts.test, "test");
  assert.ok(result.dependencies.includes("react-native"));
});

test("rejects a directory without package.json", () => assert.throws(() => discoverSource(temp()), /Not a JavaScript project/));

test("copies source while excluding secrets and caches", () => {
  const target = join(temp(), "copy");
  copySource(app(), target);
  assert.equal(readFileSync(join(target, "workshop-brief.md"), "utf8"), "# Brief");
  assert.throws(() => readFileSync(join(target, ".env")));
  assert.throws(() => readFileSync(join(target, "node_modules", "cache")));
});

test("audit identifies reusable framework and replacement dependencies", () => {
  const findings = auditSource(discoverSource(app()));
  assert.ok(findings.some((item) => item.area === "framework" && item.classification === "portable"));
  assert.ok(findings.some((item) => item.evidence === "react-native-camera" && item.classification === "replace"));
});

test("audit summary counts each classification", () => {
  const summary = summarize(auditSource(discoverSource(app())));
  assert.ok(summary.portable >= 1);
  assert.ok(summary.replace >= 1);
});

test("empty project memory is deterministic", () => {
  const memory = loadMemory(temp());
  assert.equal(memory.schemaVersion, 1);
  assert.deepEqual(memory.entries, []);
});

test("snapshot proposal keeps questions separate from decisions", () => {
  const snapshot = fixtureSnapshot(temp());
  const entries = propose(loadSnapshot(snapshot));
  assert.equal(entries.find((item) => item.text === "What about profiles?")?.section, "open_question");
  assert.equal(entries.find((item) => item.text === "Hero starts focused")?.section, "product_decision");
});

test("approved proposal writes human and machine-readable memory", () => {
  const dir = temp();
  const entries = propose(loadSnapshot(fixtureSnapshot(temp())));
  const memory = applyProposal(dir, entries);
  assert.equal(loadMemory(dir).entries.length, memory.entries.length);
  assert.match(readFileSync(join(dir, "PROJECT_CONTEXT.md"), "utf8"), /Open Questions/);
});

test("memory rendering includes provenance", () => {
  const memory = applyProposal(temp(), propose(loadSnapshot(fixtureSnapshot(temp()))));
  assert.match(renderMemory(memory), /bee:c1/);
});

test("phase context injects only approved relevant entries", () => {
  const memory = applyProposal(temp(), propose(loadSnapshot(fixtureSnapshot(temp()))));
  memory.entries[0].tags = ["vega_port"];
  memory.entries[1].tags = ["other_phase"];
  const context = assembleProjectContext(memory, "vega_port");
  assert.ok(context.entryIds.includes(memory.entries[0].id));
  assert.ok(!context.entryIds.includes(memory.entries[1].id));
  assert.match(context.text, /Approved Project Context/);
});

test("snapshot hashes change when context changes", () => {
  const base = { schemaVersion: 1 as const, provider: "bee" as const, capturedAt: new Date(0).toISOString(), query: "q", sources: [], decisions: ["a"], constraints: [], openQuestions: [] };
  assert.notEqual(snapshotHash(base), snapshotHash({ ...base, decisions: ["b"] }));
});

function fixtureSnapshot(root: string): string {
  const base = { schemaVersion: 1, provider: "bee", capturedAt: new Date(0).toISOString(), query: "product", sources: [{ id: "c1", recordedAt: "2026-01-01" }], decisions: ["Hero starts focused"], constraints: ["No account"], openQuestions: ["What about profiles?"] };
  const path = join(root, "snapshot.json");
  writeFileSync(path, JSON.stringify({ ...base, summaryHash: snapshotHash(base as Parameters<typeof snapshotHash>[0]) }));
  return path;
}
