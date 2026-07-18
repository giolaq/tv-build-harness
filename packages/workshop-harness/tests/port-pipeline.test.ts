import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PortExecutor, PortModelResult } from "../src/port-executor.js";
import { PortBudgetError, runPortPipeline } from "../src/port-pipeline.js";

class FakeExecutor implements PortExecutor {
  calls: { phase: string; prompt: string }[] = [];
  constructor(private responses: PortModelResult[]) {}
  async call(phase: string, prompt: string): Promise<PortModelResult> {
    this.calls.push({ phase, prompt });
    const result = this.responses.shift();
    if (!result) throw new Error("fake exhausted");
    return result;
  }
}

test("ports three concerns and commits each verified phase", async () => {
  const app = fixtureApp();
  const executor = new FakeExecutor(successResponses());
  const result = await pipeline(app, executor);
  assert.deepEqual(result.phases.map((phase) => phase.name), ["tv_product_spec", "vega_port", "tv_behavior"]);
  assert.equal(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: app, encoding: "utf8" }).trim(), "4");
  assert.match(readFileSync(join(app, "src/App.tsx"), "utf8"), /hasTVPreferredFocus/);
});

test("feeds exact verification failure into retry", async () => {
  const app = fixtureApp();
  const executor = new FakeExecutor([response({ "WRONG.md": "no" }), ...successResponses()]);
  const result = await pipeline(app, executor);
  assert.equal(result.phases[0].attempts, 2);
  assert.match(executor.calls[1].prompt, /TV flow documented: missing VEGA_PORT.md/);
});

test("budget abort restores a clean generated tree", async () => {
  const app = fixtureApp();
  const executor = new FakeExecutor([{ ...response({ "VEGA_PORT.md": "## TV Flow" }), costUsd: 4 }]);
  await assert.rejects(() => pipeline(app, executor, 3), PortBudgetError);
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: app, encoding: "utf8" }), "");
  assert.throws(() => readFileSync(join(app, "VEGA_PORT.md")));
});

test("rejects model paths outside the guarded app", async () => {
  const app = fixtureApp();
  const executor = new FakeExecutor([response({ "../escape.txt": "bad" })]);
  await assert.rejects(() => pipeline(app, executor), /Unsafe model output path/);
});

test("rejects model writes to environment files", async () => {
  const app = fixtureApp();
  const executor = new FakeExecutor([response({ ".env.local": "SECRET=bad" })]);
  await assert.rejects(() => pipeline(app, executor), /Unsafe model output path/);
});

function pipeline(appDir: string, executor: PortExecutor, maxCostUsd = 10) {
  return runPortPipeline({ appDir, outDir: join(appDir, ".."), findings: [], projectContext: "approved", seed: "fixed", maxCostUsd, executor });
}

function fixtureApp(): string {
  const dir = mkdtempSync(join(tmpdir(), "port-pipeline-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", scripts: {} }, null, 2));
  writeFileSync(join(dir, "App.txt"), "original");
  return dir;
}

function successResponses(): PortModelResult[] {
  return [
    response({ "VEGA_PORT.md": "# Port\n\n## TV Flow\nremote" }),
    response({ "apps/vega/manifest.toml": "[package]", "apps/vega/package.json": "{\"name\":\"vega-fixture\"}", "package.json": "{\"scripts\":{\"vega:build\":\"cd apps/vega && kepler build\"}}", "src/tv/focus-state.ts": "export const focus = true;" }),
    response({ "src/App.tsx": "const app = { onFocus: true, hasTVPreferredFocus: true };", "TV_VERIFICATION.md": "Back restores the originating card." }),
  ];
}

function response(files: Record<string, string>): PortModelResult {
  return { text: JSON.stringify({ summary: "fixture phase", files }), costUsd: 0.01 };
}
