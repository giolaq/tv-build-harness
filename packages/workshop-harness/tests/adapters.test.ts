import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BeeContextProvider } from "../src/context-providers/bee.js";
import { VegaAdapter, VegaReplayAdapter, runVegaLifecycle, type VegaCapability } from "../src/platform/vega.js";
import { runProcess } from "../src/process.js";
import { resolveExecutorConfig } from "../src/port-executor.js";

function script(body: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "workshop-bin-")), "fake tool");
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

test("process timeout is bounded", async () => {
  const fake = script("sleep 2");
  const result = await runProcess(fake, [], 20);
  assert.equal(result.timedOut, true);
});

test("Vega adapter owns capability command arrays", () => {
  const adapter = new VegaAdapter("vega");
  assert.deepEqual(adapter.command("build"), ["npm", "run", "build:debug"]);
  assert.deepEqual(adapter.command("install", "app.vpkg"), ["vega", "device", "install-app", "--packagePath", "app.vpkg"]);
  assert.deepEqual(adapter.command("capture", "/tmp/shot.png"), ["vega", "exec", "vda", "shell", "gwsi-tool-screenshooter", "/tmp/shot.png"]);
});

test("Vega adapter executes inside the guarded apps/vega directory", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "guarded-vega-"));
  const fake = script("pwd");
  const previous = process.env.NPM_BIN;
  process.env.NPM_BIN = fake;
  const result = await new VegaAdapter("vega", cwd).execute("build");
  if (previous) process.env.NPM_BIN = previous; else delete process.env.NPM_BIN;
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), realpathSync(cwd));
});

test("Vega lifecycle records every successful gate and evidence file", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-lifecycle-"));
  const app = join(root, "app");
  const vega = join(app, "apps", "vega");
  mkdirSync(vega, { recursive: true });
  writeFileSync(join(app, "tv-focus-result.json"), JSON.stringify({ passed: true, transitions: ["launch-hero", "down-to-first-rail", "left-boundary", "right-boundary", "open-details", "back-restore"] }));
  const capabilities: VegaCapability[] = ["sdk_version", "device_status", "build", "install", "launch", "logs", "capture", "pull"];
  const turns = capabilities.map((capability) => ({ capability, result: { code: 0, stdout: capability === "sdk_version" ? "Active SDK Version: 0.22.5875" : capability === "logs" ? "Pocket Cinema started" : "ok", stderr: "", timedOut: false } }));
  const result = await runVegaLifecycle({ adapter: new VegaReplayAdapter(turns), appDir: vega, focusDir: app, outDir: root, evidenceMode: "replay", packagePath: "build/pocket.vpkg", appId: "com.tvbuild.pocketcinema.main" });
  assert.deepEqual(result.steps.map((step) => step.capability), capabilities);
  assert.equal(result.checks[0].passed, true);
  assert.equal(result.blockers.length, 0);
  assert.ok(existsSync(join(root, "01-launch.png")));
  assert.match(readFileSync(join(root, "vega-device.log"), "utf8"), /Pocket Cinema started/);
});

test("Vega lifecycle stops after a failed gate", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-lifecycle-fail-"));
  writeFileSync(join(root, "tv-focus-result.json"), JSON.stringify({ passed: true }));
  const adapter = new VegaReplayAdapter([
    { capability: "sdk_version", result: { code: 0, stdout: "Active SDK Version: 0.22.5875", stderr: "", timedOut: false } },
    { capability: "device_status", result: { code: 2, stdout: "", stderr: "no device", timedOut: false } },
  ]);
  const result = await runVegaLifecycle({ adapter, appDir: root, outDir: root, evidenceMode: "replay", packagePath: "app.vpkg", appId: "app.main" });
  assert.deepEqual(result.steps.map((step) => step.capability), ["sdk_version", "device_status"]);
  assert.match(result.blockers[0], /no device/);
});

test("Vega lifecycle treats an empty successful device list as unavailable", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-no-device-"));
  writeFileSync(join(root, "tv-focus-result.json"), JSON.stringify({ passed: true }));
  writeFileSync(join(root, "vega-device.log"), "stale replay log");
  const adapter = new VegaReplayAdapter([
    { capability: "sdk_version", result: { code: 0, stdout: "0.22.5875", stderr: "", timedOut: false } },
    { capability: "device_status", result: { code: 0, stdout: "List of devices attached\n\n", stderr: "", timedOut: false } },
  ]);
  const result = await runVegaLifecycle({ adapter, appDir: root, outDir: root, evidenceMode: "live", appId: "app.main" });
  assert.deepEqual(result.steps.map((step) => step.capability), ["sdk_version", "device_status"]);
  assert.match(result.blockers[0], /no VDA device/);
  assert.deepEqual(result.logFiles, []);
  assert.equal(existsSync(join(root, "vega-device.log")), false);
});

test("Vega lifecycle rejects a different active SDK", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-sdk-mismatch-"));
  const adapter = new VegaReplayAdapter([
    { capability: "sdk_version", result: { code: 0, stdout: "Active SDK Version: 0.23.0", stderr: "", timedOut: false } },
  ]);
  const result = await runVegaLifecycle({ adapter, appDir: root, outDir: root, evidenceMode: "replay", packagePath: "app.vpkg", appId: "app.main" });
  assert.deepEqual(result.steps.map((step) => step.capability), ["sdk_version"]);
  assert.match(result.blockers[0], /expected 0\.22\.5875/);
});

test("Vega lifecycle rejects incomplete focus evidence", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-focus-incomplete-"));
  writeFileSync(join(root, "tv-focus-result.json"), JSON.stringify({ passed: true, transitions: ["launch-hero"] }));
  const capabilities: VegaCapability[] = ["sdk_version", "device_status", "build", "install", "launch", "logs", "capture", "pull"];
  const turns = capabilities.map((capability) => ({ capability, result: { code: 0, stdout: capability === "sdk_version" ? "0.22.5875" : "ok", stderr: "", timedOut: false } }));
  const result = await runVegaLifecycle({ adapter: new VegaReplayAdapter(turns), appDir: root, outDir: root, evidenceMode: "replay", packagePath: "app.vpkg", appId: "app.main" });
  assert.equal(result.checks[0].passed, false);
  assert.match(result.blockers.at(-1) ?? "", /every required transition/);
});

test("Bee search parses candidates without transcript text", async () => {
  const fake = script('printf \'[{"id":"c1","recordedAt":"2026-01-01","title":"Planning","summary":"TV app"}]\\n\'');
  const rows = await new BeeContextProvider(fake).search("TV");
  assert.deepEqual(rows[0], { id: "c1", recordedAt: "2026-01-01", title: "Planning", summary: "TV app" });
});

test("Bee failure is explicit", async () => {
  const fake = script("echo unavailable >&2; exit 3");
  await assert.rejects(() => new BeeContextProvider(fake).search("TV"), /unavailable/);
});

test("executor config defaults to local Claude Code", () => {
  assert.deepEqual(resolveExecutorConfig({ command: "claude-test", model: "sonnet" }), { kind: "claude-cli", command: "claude-test", model: "sonnet" });
});

test("executor config supports Strands remote providers", () => {
  assert.deepEqual(resolveExecutorConfig({ executor: "strands", provider: "openai", model: "gpt-test" }), { kind: "strands", model: { provider: "openai", modelId: "gpt-test", region: undefined } });
  assert.throws(() => resolveExecutorConfig({ executor: "strands", provider: "unknown" }), /Unknown Strands provider/);
});
