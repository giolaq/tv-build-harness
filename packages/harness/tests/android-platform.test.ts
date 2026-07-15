import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AndroidTvAdapter } from "../src/platforms/android-tv.js";
import { runDpadFlow } from "../src/platforms/dpad-flow.js";
import type { CommandRequest, CommandResult, CommandRunner } from "../src/process/command-runner.js";
import type { PlatformContext } from "../src/platforms/types.js";

class FakeRunner implements CommandRunner {
  requests: CommandRequest[] = [];
  constructor(private readonly responses: Array<Partial<CommandResult>> = []) {}
  async run(request: CommandRequest): Promise<CommandResult> {
    this.requests.push(request);
    const response = this.responses.shift() ?? {};
    return { exitCode: 0, stdout: "", stderr: "", durationMs: 1, timedOut: false, truncated: false, ...response };
  }
}

const context: PlatformContext = {
  appDir: "/tmp/app with spaces",
  artifactsDir: "/tmp/android-artifacts",
  deviceSerial: "emulator-5554",
  profile: {
    projectDir: ".", module: "app", variant: "debug", packageName: "com.example", activity: ".MainActivity",
    compileTask: ":app:compileDebugKotlin", assembleTask: ":app:assembleDebug", installTask: ":app:installDebug",
    apkPath: "app/build/outputs/apk/debug/app-debug.apk",
  },
};

describe("Android TV adapter", () => {
  it("selects an online device and runs stack-specific Gradle tasks", async () => {
    const runner = new FakeRunner([{ stdout: "List of devices attached\nemulator-5554\tdevice\n" }, {}, {}]);
    const adapter = new AndroidTvAdapter(runner, "legacy");
    const device = await adapter.discoverDevice();
    const build = await adapter.build(context);
    expect(device.details?.serial).toBe("emulator-5554");
    expect(build.every((result) => result.ok)).toBe(true);
    expect(runner.requests.map((request) => [request.command, request.args])).toContainEqual(["./gradlew", [":app:assembleDebug", "--console=plain"]]);
  });

  it("classifies Gradle failures as product failures", async () => {
    const adapter = new AndroidTvAdapter(new FakeRunner([{ exitCode: 1, stderr: "compile failed" }]), "legacy");
    const [result] = await adapter.build(context);
    expect(result).toMatchObject({ ok: false, failureClass: "product", step: "compile" });
  });

  it("detects a behavioral focus mismatch", async () => {
    const adapter = {
      input: async () => ({ ok: true, message: "sent" }),
      observeFocus: async () => ({ id: "card-3" }),
    };
    const result = await runDpadFlow(adapter, context, [{ action: "right", expectFocus: "card-2" }]);
    expect(result.ok).toBe(false);
    expect(result.steps[0].error).toMatch(/card-2.*card-3/);
  });

  it("uses Android CLI to describe, deploy, and capture the app", async () => {
    const runner = new FakeRunner([
      { stdout: "/sdk" },
      { stdout: "metadata.json" },
      { stdout: "deployed" },
      { stdout: "captured" },
    ]);
    const adapter = new AndroidTvAdapter(runner, "required");
    expect((await adapter.initialize(context.appDir)).ok).toBe(true);
    expect((await adapter.describe(context)).ok).toBe(true);
    expect((await adapter.install(context)).ok).toBe(true);
    expect((await adapter.screenshot(context, "home")).ok).toBe(true);

    expect(runner.requests.map(({ command, args }) => [command, args])).toEqual(expect.arrayContaining([
      ["android", ["info"]],
      ["android", ["describe", "--project_dir=/tmp/app with spaces"]],
      ["android", ["run", "--apks=/tmp/app with spaces/app/build/outputs/apk/debug/app-debug.apk", "--device=emulator-5554", "--activity=.MainActivity"]],
      ["android", ["screen", "capture", "--output=/tmp/android-artifacts/home.png"]],
    ]));
  });

  it("installs and verifies the Android CLI agent skill", async () => {
    const runner = new FakeRunner([{ stdout: "/sdk" }, { stdout: "installed" }, { stdout: "android-cli installed for codex" }]);
    const adapter = new AndroidTvAdapter(runner, "required");
    const result = await adapter.setupAgent(context.appDir);
    expect(result).toMatchObject({ ok: true, step: "agent-skill" });
    expect(runner.requests.map(({ command, args }) => [command, args])).toEqual([
      ["android", ["info"]],
      ["android", ["init"]],
      ["android", ["skills", "list", "--long"]],
    ]);
  });

  it("records the compatibility backend when Android CLI is unavailable", async () => {
    const runner = new FakeRunner([{ exitCode: 127, stderr: "android: command not found" }]);
    const adapter = new AndroidTvAdapter(runner, "auto");
    const result = await adapter.initialize(context.appDir);
    expect(result).toMatchObject({ ok: true, details: { backend: "gradle-adb", fallback: true } });
    expect(adapter.getBackend()).toBe("gradle-adb");
  });

  it("fails setup when Android CLI is required but unavailable", async () => {
    const runner = new FakeRunner([{ exitCode: 127, stderr: "android: command not found" }]);
    const adapter = new AndroidTvAdapter(runner, "required");
    const result = await adapter.initialize(context.appDir);
    expect(result).toMatchObject({ ok: false, step: "tooling", failureClass: "environment" });
  });

  it("deploys the APK path discovered from Android CLI metadata", async () => {
    const root = mkdtempSync(join(tmpdir(), "tv-build android cli "));
    try {
      const metadata = join(root, "build metadata.json");
      writeFileSync(metadata, JSON.stringify({ targets: [{ outputs: [{ path: "app/build/outputs/apk/debug/discovered.apk" }] }] }));
      const runner = new FakeRunner([{ stdout: "/sdk" }, { stdout: `metadata: "${metadata}"` }, { stdout: "deployed" }]);
      const adapter = new AndroidTvAdapter(runner, "required");
      const describedContext: PlatformContext = {
        ...context,
        appDir: root,
        artifactsDir: join(root, "artifacts"),
        profile: { ...context.profile },
      };
      await adapter.initialize(root);
      await adapter.describe(describedContext);
      await adapter.install(describedContext);
      expect(runner.requests.at(-1)?.args).toContain(`--apks=${join(root, "app/build/outputs/apk/debug/discovered.apk")}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("starts a named emulator through Android CLI", async () => {
    const runner = new FakeRunner([{ stdout: "/sdk" }, { stdout: "started" }]);
    const adapter = new AndroidTvAdapter(runner, "required");
    const result = await adapter.startEmulator("Television_1080p_API_34", context.appDir);
    expect(result).toMatchObject({ ok: true, step: "emulator-start" });
    expect(runner.requests.at(-1)?.args).toEqual(["emulator", "start", "Television_1080p_API_34"]);
  });
});
