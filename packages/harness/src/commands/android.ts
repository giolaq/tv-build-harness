import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { AndroidTvAdapter } from "../platforms/android-tv.js";
import type { AndroidBuildProfile, PlatformContext, PlatformResult, RemoteAction } from "../platforms/types.js";
import { detectStack, getAndroidBuildProfile } from "../stack-detector.js";
import { writeError, writeEvent, writeJson, EXIT } from "../output.js";
import { runDpadFlow, type DpadStep } from "../platforms/dpad-flow.js";

export async function runAndroidCommand(args: string[], jsonMode: boolean): Promise<void> {
  const target = args.find((arg) => !arg.startsWith("--"));
  if (!target) return fail(jsonMode, "android_target_missing", "Provide a runId or app directory.", "Run tv-build android <runId|appDir> --plan --json.", EXIT.input);
  const appDir = resolveAppDir(target);
  if (!appDir) return fail(jsonMode, "android_target_invalid", `Cannot resolve Android app from ${target}.`, "Pass a generated app directory or an existing runId.", EXIT.input);

  const stack = detectStack(appDir);
  const profile = loadProfile(appDir, getAndroidBuildProfile(stack));
  const runDir = appDir.endsWith(`${join("", "app")}`) ? dirname(appDir) : appDir;
  const artifactsDir = join(runDir, "android");
  const plan = { command: "android", appDir, stack, profile, steps: selectedSteps(args) };
  if (args.includes("--plan")) {
    if (jsonMode) writeJson(plan);
    else printPlan(plan);
    return;
  }
  if (jsonMode && !args.includes("--yes")) return fail(jsonMode, "confirmation_required", "Android execution requires --yes in JSON mode.", "Show the Android plan to the human, then rerun with --yes.", EXIT.input);

  mkdirSync(artifactsDir, { recursive: true });
  const adapter = new AndroidTvAdapter();
  const device = await adapter.discoverDevice(flagValue(args, "--device"));
  if (!device.ok) return finishFailure(jsonMode, device);
  const serial = String(device.details?.serial);
  const boot = await adapter.waitForBoot(serial);
  if (!boot.ok) return finishFailure(jsonMode, boot);
  const context: PlatformContext = { appDir, profile, deviceSerial: serial, artifactsDir };
  const results: PlatformResult[] = [device, boot];

  if (args.includes("--build")) results.push(...await adapter.build(context));
  if (results.every((result) => result.ok) && args.includes("--install")) results.push(await adapter.install(context));
  if (results.every((result) => result.ok) && args.includes("--launch")) results.push(await adapter.launch(context));
  if (results.every((result) => result.ok) && args.includes("--test")) {
    const flowPath = flagValue(args, "--flow");
    if (flowPath) {
      const flow = JSON.parse(readFileSync(resolve(flowPath), "utf-8")) as { steps: DpadStep[] };
      const result = await runDpadFlow(adapter, context, flow.steps);
      const artifact = join(artifactsDir, "dpad-flow.json");
      writeFileSync(artifact, JSON.stringify({ schemaVersion: 1, ...result }, null, 2));
      results.push({ ok: result.ok, step: "dpad", message: result.ok ? "D-pad flow passed" : result.steps.at(-1)?.error ?? "D-pad flow failed", artifact, failureClass: result.ok ? undefined : "product" });
    } else {
      results.push(await adapter.input(context, parseActions(flagValue(args, "--actions"))));
    }
  }
  if (args.includes("--screenshot") || args.includes("--test")) results.push(await adapter.screenshot(context, flagValue(args, "--screenshot") ?? "android-home"));
  if (args.includes("--logs") || results.some((result) => !result.ok)) results.push(await adapter.logs(context));
  await adapter.cleanup();

  const handoff = writeHandoff(runDir, context, results);
  for (const result of results) {
    if (jsonMode) writeEvent("phase_message", { phase: "android", step: result.step, ok: result.ok, message: result.message, artifact: result.artifact });
    else console.log(`  ${result.ok ? "PASS" : "FAIL"} ${result.step}: ${result.message}`);
  }
  const failed = results.find((result) => !result.ok);
  if (failed) return finishFailure(jsonMode, failed, handoff);
  if (jsonMode) writeEvent("run_complete", { mode: "android", status: "success", appDir, deviceSerial: serial, handoff });
  else console.log(`\n  Android handoff: ${handoff}\n`);
}

function resolveAppDir(target: string): string | undefined {
  const direct = resolve(target);
  if (isApp(direct)) return direct;
  const run = resolve("out", target, "app");
  if (isApp(run)) return run;
  return undefined;
}

function isApp(path: string): boolean {
  return existsSync(join(path, "package.json")) || existsSync(join(path, "settings.gradle.kts")) || existsSync(join(path, "build.gradle"));
}

function loadProfile(appDir: string, base: AndroidBuildProfile): AndroidBuildProfile {
  const configPaths = [join(appDir, "harness.config.json"), join(dirname(appDir), "run-input.json")];
  for (const path of configPaths) {
    if (!existsSync(path)) continue;
    try {
      const raw = JSON.parse(readFileSync(path, "utf-8"));
      const android = raw.android ?? raw.harness?.android;
      if (android) return { ...base, ...Object.fromEntries(Object.entries(android).filter(([, value]) => value !== undefined)) };
    } catch {}
  }
  return base;
}

function selectedSteps(args: string[]): string[] {
  const steps = ["device", "boot"];
  for (const [flag, name] of [["--build", "build"], ["--install", "install"], ["--launch", "launch"], ["--test", "test"], ["--screenshot", "screenshot"], ["--logs", "logs"]]) {
    if (args.includes(flag)) steps.push(name);
  }
  return steps;
}

function parseActions(value?: string): RemoteAction[] {
  const allowed = new Set<RemoteAction>(["up", "down", "left", "right", "select", "back"]);
  return (value ?? "right,right,select,back").split(",").filter((item): item is RemoteAction => allowed.has(item as RemoteAction));
}

function flagValue(args: string[], flag: string): string | undefined {
  const equals = args.find((arg) => arg.startsWith(`${flag}=`));
  const index = args.indexOf(flag);
  return equals?.slice(flag.length + 1) ?? (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : undefined);
}

function writeHandoff(runDir: string, context: PlatformContext, results: PlatformResult[]): string {
  const path = join(runDir, "android-handoff.json");
  const failed = results.find((result) => !result.ok);
  writeFileSync(path, JSON.stringify({
    schemaVersion: 1, appDir: context.appDir, projectDir: context.profile.projectDir,
    module: context.profile.module, variant: context.profile.variant, packageName: context.profile.packageName,
    activity: context.profile.activity, apk: resolve(context.appDir, context.profile.projectDir, context.profile.apkPath),
    deviceSerial: context.deviceSerial, gradleTasks: {
      compile: context.profile.compileTask, assemble: context.profile.assembleTask, install: context.profile.installTask,
    }, artifactsDir: context.artifactsDir, lastFailure: failed ? { step: failed.step, message: failed.message } : null,
  }, null, 2));
  const report = join(runDir, "report.md");
  appendFileSync(report, `\n## Android handoff\n\n- Project: \`${resolve(context.appDir, context.profile.projectDir)}\`\n- Compile: \`./gradlew ${context.profile.compileTask}\`\n- Assemble: \`./gradlew ${context.profile.assembleTask}\`\n- Install: \`./gradlew ${context.profile.installTask}\`\n- Device: \`${context.deviceSerial ?? "not selected"}\`\n- Metadata: \`${path}\`\n`);
  return path;
}

function printPlan(plan: Record<string, unknown>): void {
  console.log("\n  Android TV plan\n");
  console.log(JSON.stringify(plan, null, 2));
}

function finishFailure(jsonMode: boolean, result: PlatformResult, handoff?: string): void {
  const exit = result.failureClass === "input" ? EXIT.input : result.failureClass === "environment" ? EXIT.environment : result.failureClass === "aborted" ? EXIT.aborted : EXIT.runFailure;
  fail(jsonMode, `android_${result.step}_failed`, result.message, handoff ? `Inspect ${handoff}.` : "Run tv-build doctor --fix, then inspect the Android plan.", exit);
}

function fail(jsonMode: boolean, code: string, message: string, hint: string, exitCode: number): never {
  if (jsonMode) writeError(code, message, hint);
  else { console.error(`  ${message}`); console.error(`  Hint: ${hint}`); }
  process.exit(exitCode);
}
