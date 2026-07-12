import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { commandRunner, type CommandRunner } from "../process/command-runner.js";
import type { PlatformAdapter, PlatformContext, PlatformResult, RemoteAction } from "./types.js";
import type { FocusObservation } from "./dpad-flow.js";

const KEYCODES: Record<RemoteAction, string> = {
  up: "19", down: "20", left: "21", right: "22", select: "23", back: "4",
};

export class AndroidTvAdapter implements PlatformAdapter {
  constructor(private readonly runner: CommandRunner = commandRunner) {}

  async doctor(): Promise<PlatformResult[]> {
    return Promise.all([
      this.probe("adb", ["version"], "adb"),
      this.probe("emulator", ["-list-avds"], "emulator"),
    ]);
  }

  async discoverDevice(preferred?: string): Promise<PlatformResult> {
    const result = await this.run("adb", ["devices"], process.cwd(), 10_000);
    if (result.exitCode !== 0) return failure("device", "adb devices failed", "environment", result);
    const devices = result.stdout.split("\n").slice(1).map((line) => line.trim().split(/\s+/))
      .filter((entry) => entry[0] && entry[1] === "device").map((entry) => entry[0]);
    const serial = preferred ? devices.find((item) => item === preferred) : devices[0];
    if (!serial) return failure("device", preferred ? `Android device ${preferred} is unavailable` : "No online Android device found", "environment", result);
    return { ok: true, step: "device", message: `Using Android device ${serial}`, details: { serial, devices } };
  }

  async waitForBoot(serial: string, timeoutMs = 90_000): Promise<PlatformResult> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const result = await this.run("adb", ["-s", serial, "shell", "getprop", "sys.boot_completed"], process.cwd(), 5_000);
      if (result.exitCode === 0 && result.stdout.trim() === "1") {
        return { ok: true, step: "boot", message: `Android device ${serial} finished booting`, command: result };
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    return failure("boot", `Android device ${serial} did not finish booting`, "environment");
  }

  async build(context: PlatformContext): Promise<PlatformResult[]> {
    const cwd = resolve(context.appDir, context.profile.projectDir);
    const compile = await this.gradle(cwd, context.profile.compileTask, "compile");
    if (!compile.ok) return [compile];
    const assemble = await this.gradle(cwd, context.profile.assembleTask, "assemble");
    return [compile, assemble];
  }

  async install(context: PlatformContext): Promise<PlatformResult> {
    const cwd = resolve(context.appDir, context.profile.projectDir);
    const args = [context.profile.installTask];
    if (context.deviceSerial) args.push(`-Pandroid.injected.device.serial=${context.deviceSerial}`);
    const result = await this.run("./gradlew", args, cwd, 600_000);
    return result.exitCode === 0
      ? { ok: true, step: "install", message: `${context.profile.installTask} passed`, command: result }
      : failure("install", result.stderr || result.stdout || "Gradle install failed", "product", result);
  }

  async launch(context: PlatformContext): Promise<PlatformResult> {
    if (!context.profile.packageName || !context.profile.activity) {
      return failure("launch", "Android packageName and activity are required", "input");
    }
    const args = this.adbArgs(context, ["shell", "am", "start", "-n", `${context.profile.packageName}/${context.profile.activity}`]);
    const result = await this.run("adb", args, context.appDir, 30_000);
    return result.exitCode === 0
      ? { ok: true, step: "launch", message: `Launched ${context.profile.packageName}`, command: result }
      : failure("launch", result.stderr || result.stdout || "Activity launch failed", "product", result);
  }

  async input(context: PlatformContext, actions: RemoteAction[]): Promise<PlatformResult> {
    for (const action of actions) {
      const result = await this.run("adb", this.adbArgs(context, ["shell", "input", "keyevent", KEYCODES[action]]), context.appDir, 5_000);
      if (result.exitCode !== 0) return failure("input", `D-pad action ${action} failed`, "environment", result);
    }
    return { ok: true, step: "input", message: `Sent ${actions.length} D-pad actions`, details: { actions } };
  }

  async screenshot(context: PlatformContext, name: string): Promise<PlatformResult> {
    mkdirSync(context.artifactsDir, { recursive: true });
    const remote = `/sdcard/tv-build-${Date.now()}.png`;
    const output = join(context.artifactsDir, `${name}.png`);
    const capture = await this.run("adb", this.adbArgs(context, ["shell", "screencap", "-p", remote]), context.appDir, 10_000);
    if (capture.exitCode !== 0) return failure("screenshot", "Android screenshot capture failed", "environment", capture);
    const pull = await this.run("adb", this.adbArgs(context, ["pull", remote, output]), context.appDir, 30_000);
    await this.run("adb", this.adbArgs(context, ["shell", "rm", remote]), context.appDir, 5_000);
    return pull.exitCode === 0
      ? { ok: true, step: "screenshot", message: `Screenshot saved to ${output}`, artifact: output, command: pull }
      : failure("screenshot", "Android screenshot pull failed", "environment", pull);
  }

  async logs(context: PlatformContext): Promise<PlatformResult> {
    mkdirSync(context.artifactsDir, { recursive: true });
    const result = await this.run("adb", this.adbArgs(context, ["logcat", "-d", "-v", "brief"]), context.appDir, 30_000);
    const output = join(context.artifactsDir, "logcat.txt");
    writeFileSync(output, result.stdout || result.stderr);
    return { ok: result.exitCode === 0, step: "logs", message: `Logcat saved to ${output}`, artifact: output, command: result, failureClass: result.exitCode === 0 ? undefined : "environment" };
  }

  async observeFocus(context: PlatformContext): Promise<FocusObservation | undefined> {
    mkdirSync(context.artifactsDir, { recursive: true });
    const remote = `/sdcard/tv-build-window-${Date.now()}.xml`;
    const local = join(context.artifactsDir, "window.xml");
    const dump = await this.run("adb", this.adbArgs(context, ["shell", "uiautomator", "dump", remote]), context.appDir, 10_000);
    if (dump.exitCode !== 0) return undefined;
    const pull = await this.run("adb", this.adbArgs(context, ["pull", remote, local]), context.appDir, 10_000);
    await this.run("adb", this.adbArgs(context, ["shell", "rm", remote]), context.appDir, 5_000);
    if (pull.exitCode !== 0) return undefined;
    const xml = (await import("node:fs")).readFileSync(local, "utf-8");
    const node = xml.match(/<node\b[^>]*focused="true"[^>]*>/)?.[0];
    if (!node) return undefined;
    const attr = (name: string) => node.match(new RegExp(`${name}="([^"]*)"`))?.[1] || undefined;
    return { id: attr("resource-id"), text: attr("text") || attr("content-desc"), bounds: attr("bounds") };
  }

  async cleanup(): Promise<void> {}

  private async probe(command: string, args: string[], step: string): Promise<PlatformResult> {
    try {
      const result = await this.run(command, args, process.cwd(), 5_000);
      return result.exitCode === 0
        ? { ok: true, step, message: `${command} is available`, command: result }
        : failure(step, `${command} probe failed`, "environment", result);
    } catch (error) {
      return failure(step, `${command} is unavailable: ${error instanceof Error ? error.message : error}`, "environment");
    }
  }

  private async gradle(cwd: string, task: string, step: string): Promise<PlatformResult> {
    const result = await this.run("./gradlew", [task, "--console=plain"], cwd, 600_000);
    return result.exitCode === 0
      ? { ok: true, step, message: `${task} passed`, command: result }
      : failure(step, result.stderr || result.stdout || `${task} failed`, "product", result);
  }

  private adbArgs(context: PlatformContext, args: string[]): string[] {
    return context.deviceSerial ? ["-s", context.deviceSerial, ...args] : args;
  }

  private run(command: string, args: string[], cwd: string, timeoutMs: number) {
    return this.runner.run({ command, args, cwd, timeoutMs, maxOutputBytes: 2_000_000 });
  }
}

function failure(step: string, message: string, failureClass: PlatformResult["failureClass"], command?: PlatformResult["command"]): PlatformResult {
  return { ok: false, step, message: message.slice(0, 2_000), failureClass, command };
}
