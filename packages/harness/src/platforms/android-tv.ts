import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { commandRunner, type CommandRunner } from "../process/command-runner.js";
import type { AndroidToolBackend, PlatformAdapter, PlatformContext, PlatformResult, RemoteAction } from "./types.js";
import type { FocusObservation } from "./dpad-flow.js";

const KEYCODES: Record<RemoteAction, string> = {
  up: "19", down: "20", left: "21", right: "22", select: "23", back: "4",
};

export class AndroidTvAdapter implements PlatformAdapter {
  private backend: AndroidToolBackend = "gradle-adb";
  private initialized = false;
  private deployedWithCli = false;

  constructor(
    private readonly runner: CommandRunner = commandRunner,
    private readonly cliMode: "auto" | "required" | "legacy" = "auto",
  ) {}

  getBackend(): AndroidToolBackend {
    return this.backend;
  }

  async initialize(cwd = process.cwd()): Promise<PlatformResult> {
    if (this.initialized) return toolingResult(this.backend);
    this.initialized = true;
    if (this.cliMode === "legacy") return toolingResult(this.backend);

    try {
      const probe = await this.run("android", ["info"], cwd, 5_000);
      if (probe.exitCode === 0) {
        this.backend = "android-cli";
        return { ok: true, step: "tooling", message: "Android CLI is the preferred Android backend", command: probe, details: { backend: this.backend } };
      }
      if (this.cliMode === "required") return failure("tooling", "Android CLI is required but `android info` failed", "environment", probe);
    } catch (error) {
      if (this.cliMode === "required") return failure("tooling", `Android CLI is required but unavailable: ${errorMessage(error)}`, "environment");
    }
    return { ok: true, step: "tooling", message: "Android CLI unavailable; using the Gradle/ADB compatibility path", details: { backend: this.backend, fallback: true } };
  }

  async setupAgent(cwd = process.cwd()): Promise<PlatformResult> {
    const ready = await this.initialize(cwd);
    if (!ready.ok || this.backend !== "android-cli") return failure("agent-skill", "Android CLI is required to install its agent skill", "environment", ready.command);
    const init = await this.run("android", ["init"], cwd, 120_000);
    if (init.exitCode !== 0) return failure("agent-skill", init.stderr || init.stdout || "android init failed", "environment", init);
    const list = await this.run("android", ["skills", "list", "--long"], cwd, 30_000);
    return list.exitCode === 0
      ? { ok: true, step: "agent-skill", message: "Android CLI agent skill installed and discoverable", command: list }
      : failure("agent-skill", list.stderr || list.stdout || "Android CLI skill verification failed", "environment", list);
  }

  async describe(context: PlatformContext): Promise<PlatformResult> {
    await this.initialize(context.appDir);
    if (this.backend !== "android-cli") {
      return { ok: true, step: "describe", message: "Project description skipped on the compatibility backend", details: { backend: this.backend, skipped: true } };
    }
    mkdirSync(context.artifactsDir, { recursive: true });
    const projectDir = resolve(context.appDir, context.profile.projectDir);
    const result = await this.run("android", ["describe", `--project_dir=${projectDir}`], context.appDir, 120_000);
    const artifact = join(context.artifactsDir, "android-describe.txt");
    writeFileSync(artifact, result.stdout || result.stderr);
    const metadata = readDescribeMetadata(result.stdout, context.appDir);
    const describedApk = findArtifact(metadata.documents, /\.apk$/i);
    const resolvedApk = describedApk ? resolve(projectDir, describedApk) : undefined;
    if (resolvedApk) context.profile.apkPath = resolvedApk;
    const normalized = join(context.artifactsDir, "android-describe.json");
    writeFileSync(normalized, JSON.stringify({
      schemaVersion: 1,
      metadataFiles: metadata.files,
      apk: resolvedApk,
    }, null, 2));
    return result.exitCode === 0
      ? {
          ok: true, step: "describe", message: resolvedApk
            ? `Android CLI described the project; using APK ${resolvedApk}`
            : "Android CLI described the project; using the configured APK path",
          command: result, artifact: normalized, details: { metadataFiles: metadata.files, apk: resolvedApk },
        }
      : failure("describe", result.stderr || result.stdout || "android describe failed", "environment", result);
  }

  async startEmulator(name: string, cwd = process.cwd()): Promise<PlatformResult> {
    const ready = await this.initialize(cwd);
    if (!ready.ok || this.backend !== "android-cli") return failure("emulator-start", "Android CLI is required to start an emulator by profile", "environment", ready.command);
    const result = await this.run("android", ["emulator", "start", name], cwd, 120_000);
    return result.exitCode === 0
      ? { ok: true, step: "emulator-start", message: `Android CLI started emulator ${name}`, command: result, details: { name } }
      : failure("emulator-start", result.stderr || result.stdout || `Could not start emulator ${name}`, "environment", result);
  }

  async doctor(): Promise<PlatformResult[]> {
    return Promise.all([
      this.probe("android", ["info"], "android-cli"),
      this.probe("adb", ["version"], "adb"),
      this.probe("android", ["emulator", "list"], "emulator"),
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
    await this.initialize(context.appDir);
    if (this.backend === "android-cli") return this.deployWithCli(context, "install");
    const cwd = resolve(context.appDir, context.profile.projectDir);
    const args = [context.profile.installTask];
    if (context.deviceSerial) args.push(`-Pandroid.injected.device.serial=${context.deviceSerial}`);
    const result = await this.run("./gradlew", args, cwd, 600_000);
    return result.exitCode === 0
      ? { ok: true, step: "install", message: `${context.profile.installTask} passed`, command: result }
      : failure("install", result.stderr || result.stdout || "Gradle install failed", "product", result);
  }

  async launch(context: PlatformContext): Promise<PlatformResult> {
    await this.initialize(context.appDir);
    if (this.backend === "android-cli") {
      if (this.deployedWithCli) return { ok: true, step: "launch", message: "Android CLI already installed and launched the APK", details: { backend: this.backend } };
      return this.deployWithCli(context, "launch");
    }
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
    await this.initialize(context.appDir);
    if (this.backend === "android-cli") {
      const output = join(context.artifactsDir, `${name}.png`);
      const capture = await this.run("android", ["screen", "capture", `--output=${output}`], context.appDir, 30_000);
      return capture.exitCode === 0
        ? { ok: true, step: "screenshot", message: `Android CLI screenshot saved to ${output}`, artifact: output, command: capture }
        : failure("screenshot", capture.stderr || capture.stdout || "Android CLI screenshot capture failed", "environment", capture);
    }
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
    await this.initialize(context.appDir);
    if (this.backend === "android-cli") {
      const local = join(context.artifactsDir, "layout.json");
      const layout = await this.run("android", ["layout", "--pretty", `--output=${local}`], context.appDir, 30_000);
      if (layout.exitCode !== 0) return undefined;
      try {
        const focused = findFocusedNode(JSON.parse(readFileSync(local, "utf-8")));
        return focused ? {
          id: stringField(focused, "resourceId", "resource-id", "id"),
          text: stringField(focused, "text", "contentDescription", "content-desc", "label"),
          bounds: stringField(focused, "bounds"),
        } : undefined;
      } catch {
        return undefined;
      }
    }
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

  private async deployWithCli(context: PlatformContext, step: "install" | "launch"): Promise<PlatformResult> {
    const apk = resolve(context.appDir, context.profile.projectDir, context.profile.apkPath);
    const args = ["run", `--apks=${apk}`];
    if (context.deviceSerial) args.push(`--device=${context.deviceSerial}`);
    if (context.profile.activity) args.push(`--activity=${context.profile.activity}`);
    const result = await this.run("android", args, context.appDir, 180_000);
    if (result.exitCode === 0) {
      this.deployedWithCli = true;
      return { ok: true, step, message: `Android CLI installed and launched ${apk}`, command: result, details: { backend: this.backend, apk } };
    }
    return failure(step, result.stderr || result.stdout || "Android CLI deployment failed", "product", result);
  }

  private adbArgs(context: PlatformContext, args: string[]): string[] {
    return context.deviceSerial ? ["-s", context.deviceSerial, ...args] : args;
  }

  private run(command: string, args: string[], cwd: string, timeoutMs: number) {
    return this.runner.run({ command, args, cwd, timeoutMs, maxOutputBytes: 2_000_000 });
  }
}

function toolingResult(backend: AndroidToolBackend): PlatformResult {
  return { ok: true, step: "tooling", message: `Using ${backend}`, details: { backend } };
}

function findFocusedNode(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findFocusedNode(item);
      if (match) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.focused === true || record.isFocused === true || record.focus === true) return record;
  for (const child of Object.values(record)) {
    const match = findFocusedNode(child);
    if (match) return match;
  }
  return undefined;
}

function stringField(record: Record<string, unknown>, ...names: string[]): string | undefined {
  for (const name of names) if (typeof record[name] === "string") return record[name] as string;
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readDescribeMetadata(stdout: string, cwd: string): { files: string[]; documents: unknown[] } {
  const documents: unknown[] = [];
  try { documents.push(JSON.parse(stdout)); } catch {}
  const quoted = Array.from(stdout.matchAll(/["']([^"']+\.json)["']/gi), (match) => match[1]);
  const unquoted = stdout.split("\n").map((line) => line.trim()).filter((line) => /^[^:]+\.json$/i.test(line));
  const referenced = findArtifacts(documents, /\.json$/i);
  const files = Array.from(new Set([...quoted, ...unquoted, ...referenced].map((value) => resolve(cwd, value))));
  for (const file of files) {
    if (!existsSync(file)) continue;
    try { documents.push(JSON.parse(readFileSync(file, "utf-8"))); } catch {}
  }
  return { files: files.filter(existsSync), documents };
}

function findArtifact(value: unknown, pattern: RegExp): string | undefined {
  if (typeof value === "string") return pattern.test(value) ? value : undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findArtifact(item, pattern);
      if (match) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  for (const child of Object.values(value as Record<string, unknown>)) {
    const match = findArtifact(child, pattern);
    if (match) return match;
  }
  return undefined;
}

function findArtifacts(value: unknown, pattern: RegExp): string[] {
  if (typeof value === "string") return pattern.test(value) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap((item) => findArtifacts(item, pattern));
  if (!value || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>).flatMap((child) => findArtifacts(child, pattern));
}

function failure(step: string, message: string, failureClass: PlatformResult["failureClass"], command?: PlatformResult["command"]): PlatformResult {
  return { ok: false, step, message: message.slice(0, 2_000), failureClass, command };
}
