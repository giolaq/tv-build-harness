import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PortOutputSchema } from "../src/port-contract.js";
import { createProjectReadTools } from "../src/port-tools.js";

test("Strands project tools list, read, and search the guarded app", async () => {
  const root = fixture();
  const tools = createProjectReadTools(root);
  const list = tools.find((tool) => tool.name === "list_project_files")!;
  const read = tools.find((tool) => tool.name === "read_project_file")!;
  const search = tools.find((tool) => tool.name === "search_project")!;

  assert.equal(await list.invoke({ path: "." }), "package.json\nsrc/App.tsx");
  assert.match(String(await read.invoke({ path: "src/App.tsx" })), /Pocket Cinema/);
  assert.match(String(await search.invoke({ path: "src", query: "cinema" })), /src\/App\.tsx:1/);
});

test("Strands project tools hide dependencies and environment files", async () => {
  const root = fixture();
  const tools = createProjectReadTools(root);
  const list = tools.find((tool) => tool.name === "list_project_files")!;
  const read = tools.find((tool) => tool.name === "read_project_file")!;

  assert.doesNotMatch(String(await list.invoke({ path: "." })), /node_modules|\.env/);
  await assert.rejects(() => read.invoke({ path: ".env" }), /Protected path/);
  await assert.rejects(() => read.invoke({ path: "../outside.txt" }), /Protected path/);
});

test("Strands project tools reject oversized files", async () => {
  const root = fixture();
  writeFileSync(join(root, "large.txt"), "x".repeat(100_001));
  const read = createProjectReadTools(root).find((tool) => tool.name === "read_project_file")!;
  await assert.rejects(() => read.invoke({ path: "large.txt" }), /larger than/);
});

test("port output schema is the single validated patch contract", () => {
  assert.deepEqual(PortOutputSchema.parse({ summary: "Port home", files: { "src/App.tsx": "export {}" } }).summary, "Port home");
  assert.throws(() => PortOutputSchema.parse({ summary: "", files: {} }));
  assert.throws(() => PortOutputSchema.parse({ summary: "Port home", files: [] }));
});

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "strands-tools-"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "node_modules"));
  writeFileSync(join(root, "src", "App.tsx"), "export const title = 'Pocket Cinema';\n");
  writeFileSync(join(root, "package.json"), "{}");
  writeFileSync(join(root, ".env"), "SECRET=value");
  writeFileSync(join(root, "node_modules", "hidden.js"), "hidden");
  return root;
}
