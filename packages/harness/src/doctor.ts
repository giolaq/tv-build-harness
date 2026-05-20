import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

export async function runDoctor(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  results.push(checkCommand("node", "node --version", "Node.js"));
  results.push(checkCommand("yarn", "yarn --version", "Yarn"));
  results.push(checkCommand("git", "git --version", "Git"));
  results.push(checkEnvVar("ANTHROPIC_API_KEY", "Anthropic API key"));
  results.push(checkCommand("expo", "npx expo --version", "Expo CLI"));
  results.push(checkXcode());
  results.push(checkAndroidSDK());
  results.push(checkEmulators());
  results.push(checkTvOSSimulator());
  results.push(checkDiskSpace());

  return results;
}

export function printDoctorReport(results: CheckResult[]): void {
  console.log("\n  TV App Harness — Pre-flight Check\n");

  for (const r of results) {
    const icon = r.ok ? "✓" : "✗";
    const color = r.ok ? "\x1b[32m" : "\x1b[31m";
    console.log(`  ${color}${icon}\x1b[0m ${r.name}: ${r.detail}`);
  }

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n  ${passed}/${total} checks passed.\n`);

  if (passed < total) {
    console.log("  Fix the issues above before running the harness.");
    process.exitCode = 1;
  }
}

function checkCommand(name: string, command: string, label: string): CheckResult {
  try {
    const version = execSync(command, { stdio: "pipe", timeout: 10_000 }).toString().trim();
    return { name: label, ok: true, detail: version };
  } catch {
    return { name: label, ok: false, detail: "Not found. Install it first." };
  }
}

function checkEnvVar(name: string, label: string): CheckResult {
  const value = process.env[name];
  if (value && value.length > 0) {
    return { name: label, ok: true, detail: `Set (${value.slice(0, 8)}...)` };
  }
  return { name: label, ok: false, detail: `${name} environment variable not set.` };
}

function checkXcode(): CheckResult {
  try {
    const version = execSync("xcodebuild -version", { stdio: "pipe", timeout: 10_000 }).toString().trim().split("\n")[0];
    return { name: "Xcode", ok: true, detail: version };
  } catch {
    return { name: "Xcode", ok: false, detail: "Not found. Install from the App Store." };
  }
}

function checkAndroidSDK(): CheckResult {
  const androidHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (androidHome && existsSync(androidHome)) {
    return { name: "Android SDK", ok: true, detail: androidHome };
  }
  return { name: "Android SDK", ok: false, detail: "ANDROID_HOME not set or directory doesn't exist." };
}

function checkEmulators(): CheckResult {
  try {
    const avds = execSync("emulator -list-avds", { stdio: "pipe", timeout: 10_000 }).toString().trim();
    const list = avds.split("\n").filter(Boolean);
    const tvAvd = list.find((a) => a.toLowerCase().includes("tv"));
    if (tvAvd) {
      return { name: "Android TV AVD", ok: true, detail: tvAvd };
    }
    if (list.length > 0) {
      return { name: "Android TV AVD", ok: false, detail: `Found AVDs but none with 'TV' in name: ${list.join(", ")}` };
    }
    return { name: "Android TV AVD", ok: false, detail: "No AVDs found. Create one in Android Studio." };
  } catch {
    return { name: "Android TV AVD", ok: false, detail: "emulator command not found." };
  }
}

function checkTvOSSimulator(): CheckResult {
  try {
    const output = execSync("xcrun simctl list runtimes -j", { stdio: "pipe", timeout: 10_000 }).toString();
    const runtimes = JSON.parse(output);
    const tvos = runtimes.runtimes?.find((r: { name: string }) => r.name.includes("tvOS"));
    if (tvos) {
      return { name: "tvOS Runtime", ok: true, detail: tvos.name };
    }
    return { name: "tvOS Runtime", ok: false, detail: "No tvOS runtime installed. Add it in Xcode > Settings > Platforms." };
  } catch {
    return { name: "tvOS Runtime", ok: false, detail: "xcrun simctl not available." };
  }
}

function checkDiskSpace(): CheckResult {
  try {
    const output = execSync("df -g / | tail -1", { stdio: "pipe" }).toString();
    const parts = output.trim().split(/\s+/);
    const availGB = parseInt(parts[3], 10);
    if (availGB >= 10) {
      return { name: "Disk Space", ok: true, detail: `${availGB} GB available` };
    }
    return { name: "Disk Space", ok: false, detail: `Only ${availGB} GB free. Need at least 10 GB.` };
  } catch {
    return { name: "Disk Space", ok: true, detail: "Could not check (non-critical)." };
  }
}
