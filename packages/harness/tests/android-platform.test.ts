import { describe, expect, it } from "vitest";
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
    const adapter = new AndroidTvAdapter(runner);
    const device = await adapter.discoverDevice();
    const build = await adapter.build(context);
    expect(device.details?.serial).toBe("emulator-5554");
    expect(build.every((result) => result.ok)).toBe(true);
    expect(runner.requests.map((request) => [request.command, request.args])).toContainEqual(["./gradlew", [":app:assembleDebug", "--console=plain"]]);
  });

  it("classifies Gradle failures as product failures", async () => {
    const adapter = new AndroidTvAdapter(new FakeRunner([{ exitCode: 1, stderr: "compile failed" }]));
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
});
