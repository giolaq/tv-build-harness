import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BeeContextProvider } from "../src/context-providers/bee.js";
import { VegaAdapter } from "../src/platform/vega.js";
import { runProcess } from "../src/process.js";

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
  const adapter = new VegaAdapter("kepler");
  assert.deepEqual(adapter.command("build"), ["build"]);
  assert.deepEqual(adapter.command("remote_input", "DPAD_LEFT"), ["device", "key", "DPAD_LEFT"]);
  assert.deepEqual(adapter.command("capture", "shot.png"), ["device", "screenshot", "shot.png"]);
});

test("Vega adapter executes inside the guarded apps/vega directory", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "guarded-vega-"));
  const fake = script("pwd");
  const result = await new VegaAdapter(fake, cwd).execute("build");
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), realpathSync(cwd));
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
