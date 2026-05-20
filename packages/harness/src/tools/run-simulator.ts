import { execSync, spawn } from "node:child_process";
import type { ToolDefinition, ToolHandler, ToolResult } from "../types.js";
import type { Platform } from "../types.js";

export const runSimulatorDefinition: ToolDefinition = {
  name: "run_simulator",
  description: "Launch the app on a simulator/emulator for the specified platform",
  input_schema: {
    type: "object",
    properties: {
      workdir: { type: "string", description: "Root of the template project" },
      platform: { type: "string", description: "Target platform", enum: ["androidtv", "appletv", "web"] },
    },
    required: ["workdir", "platform"],
  },
};

export const runSimulatorHandler: ToolHandler = async (input): Promise<ToolResult> => {
  const workdir = input.workdir as string;
  const platform = input.platform as Platform;

  try {
    switch (platform) {
      case "androidtv":
        return await launchAndroidTV(workdir);
      case "appletv":
        return await launchAppleTV(workdir);
      case "web":
        return await launchWeb(workdir);
      default:
        return { ok: false, output: null, error: `Unsupported simulator platform: ${platform}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, output: null, error: `run_simulator (${platform}) failed: ${message}` };
  }
};

async function launchAndroidTV(workdir: string): Promise<ToolResult> {
  const devices = execSync("emulator -list-avds", { stdio: "pipe" }).toString().trim().split("\n");
  const tvDevice = devices.find((d) => d.toLowerCase().includes("tv")) ?? devices[0];

  if (!tvDevice) {
    return { ok: false, output: null, error: "No Android TV emulator AVD found. Create one with Android Studio." };
  }

  spawn("emulator", ["-avd", tvDevice, "-no-snapshot-load"], {
    detached: true,
    stdio: "ignore",
  }).unref();

  await waitForBoot("adb wait-for-device", 60_000);

  return { ok: true, output: `Android TV emulator launched: ${tvDevice}` };
}

async function launchAppleTV(workdir: string): Promise<ToolResult> {
  const output = execSync(
    `xcrun simctl list devices available -j`,
    { stdio: "pipe" }
  ).toString();

  const devices = JSON.parse(output);
  let tvDevice: { udid: string; name: string } | undefined;

  for (const runtime of Object.values(devices.devices) as Array<Array<{ name: string; udid: string; state: string }>>) {
    const tv = runtime.find((d) => d.name.toLowerCase().includes("apple tv"));
    if (tv) {
      tvDevice = tv;
      break;
    }
  }

  if (!tvDevice) {
    return { ok: false, output: null, error: "No Apple TV simulator found. Install tvOS runtime in Xcode." };
  }

  execSync(`xcrun simctl boot "${tvDevice.udid}"`, { stdio: "pipe" });
  execSync(`open -a Simulator`, { stdio: "pipe" });

  return { ok: true, output: `Apple TV simulator launched: ${tvDevice.name} (${tvDevice.udid})` };
}

async function launchWeb(workdir: string): Promise<ToolResult> {
  spawn("npx", ["expo", "start", "--web"], {
    cwd: `${workdir}/apps/expo-multi-tv`,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, EXPO_TV: "1" },
  }).unref();

  return { ok: true, output: "Web dev server started on http://localhost:8081" };
}

function waitForBoot(command: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Simulator boot timeout")), timeoutMs);
    try {
      execSync(command, { stdio: "pipe", timeout: timeoutMs });
      clearTimeout(timer);
      resolve();
    } catch {
      clearTimeout(timer);
      reject(new Error("Simulator boot failed"));
    }
  });
}
