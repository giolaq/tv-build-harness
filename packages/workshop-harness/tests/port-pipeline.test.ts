import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AdbtContextProvider, AdbtPortContext } from "../src/context-providers/adbt.js";
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
  assert.match(readFileSync(join(app, "src/App.tsx"), "utf8"), /focus-state/);
  assert.equal(JSON.parse(readFileSync(join(app, "tv-focus-result.json"), "utf8")).passed, true);
  assert.equal(result.adbt?.mode, "replay");
  assert.equal(JSON.parse(readFileSync(join(`${app}-out`, "adbt-port-context.json"), "utf8")).targetPlatform, "vega_os");
  assert.doesNotMatch(executor.calls[0].prompt, /ADBT Vega Port Guidance/);
  assert.match(executor.calls[1].prompt, /port_tv_app_to_vega_fos_rn_app\.md/);
  assert.match(executor.calls[1].prompt, /Do not invent Vega APIs/);
  assert.doesNotMatch(executor.calls[2].prompt, /ADBT Vega Port Guidance/);
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
  return runPortPipeline({ appDir, outDir: `${appDir}-out`, findings: [], projectContext: "approved", seed: "fixed", maxCostUsd, executor, adbt: fakeAdbt() });
}

function fixtureApp(): string {
  const dir = mkdtempSync(join(tmpdir(), "port-pipeline-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", type: "module", scripts: {} }, null, 2));
  writeFileSync(join(dir, "App.txt"), "original");
  return dir;
}

function successResponses(): PortModelResult[] {
  return [
    response({ "VEGA_PORT.md": "# Port\n\n## TV Flow\nremote" }),
    response({
      "apps/vega/manifest.toml": "schema-version = 1\n[[components.interactive]]",
      "apps/vega/package.json": "{\"name\":\"vega-fixture\",\"scripts\":{\"build:debug\":\"react-native build-vega --build-type Debug\"}}",
      "apps/vega/app.json": "{\"name\":\"fixture.main\"}",
      "apps/vega/metro.config.js": "module.exports = {};",
      "package.json": "{\"type\":\"module\",\"scripts\":{\"vega:build\":\"cd apps/vega && npm run build:debug\"}}",
      "src/tv/focus-state.ts": "export const nextFocus = () => 'paper';",
      "NextSteps.md": "# Next Steps\n\n## ADBT sources\nport_tv_app_to_vega.md\n\nNo unsupported mappings in this fixture.",
    }),
    response({
      "src/App.tsx": "import { nextFocus } from './tv/focus-state';\nexport const app = nextFocus();",
      "tests/verify-tv-focus.ts": "import fs from 'node:fs'; import assert from 'node:assert/strict'; import { nextFocus } from '../src/tv/focus-state.js'; assert.equal(nextFocus(), 'paper'); fs.writeFileSync('tv-focus-result.json', JSON.stringify({ passed: true }, null, 2));",
      "TV_VERIFICATION.md": "Back restores the originating card.",
    }),
  ];
}

function response(files: Record<string, string>): PortModelResult {
  return { text: JSON.stringify({ summary: "fixture phase", files }), costUsd: 0.01 };
}

function fakeAdbt(): AdbtContextProvider {
  const context: AdbtPortContext = {
    schemaVersion: 1,
    mode: "replay",
    packageName: "@amazon-devices/amazon-devices-buildertools-mcp@1.0.5",
    targetPlatform: "vega_os",
    capturedAt: "2026-07-20T00:00:00.000Z",
    documents: [
      { name: "port_tv_app_to_vega.md", sha256: "router", excerpt: "Route React Native apps through the RN migration workflow." },
      { name: "port_tv_app_to_vega_fos_rn_app.md", sha256: "rn", excerpt: "Preserve portable JS and record unsupported native modules." },
    ],
  };
  return { async load() { return context; } };
}
