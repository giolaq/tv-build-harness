import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolveClaude } from "./claude-cli.js";

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  // Exact command (or instruction) that fixes a failing check.
  fix?: string;
  // Optional checks don't fail the report — they limit what the harness can do.
  optional?: boolean;
}

export async function runDoctor(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  results.push(checkCommand("node", "node --version", "Node.js", "Install Node 20+: https://nodejs.org or `brew install node`"));
  results.push(checkCommand("yarn", "yarn --version", "Yarn", "corepack enable && corepack prepare yarn@1.22.21 --activate"));
  results.push(checkCommand("git", "git --version", "Git", "xcode-select --install (macOS) or `brew install git`"));

  const claude = checkClaudeCli();
  results.push(claude);
  results.push(checkApiKey(claude.ok));

  results.push(checkCommand("expo", "npx expo --version", "Expo CLI", "npx handles this automatically; ensure network access for first run"));
  results.push(checkPuppeteer());
  results.push(checkXcode());
  results.push(checkAndroidSDK());
  results.push(checkEmulators());
  results.push(checkAgentDevice());
  results.push(checkTvOSSimulator());
  results.push(checkDiskSpace());

  return results;
}

export function printDoctorReport(results: CheckResult[], showFixes = false): void {
  console.log("\n  TV Build — Pre-flight Check\n");

  for (const r of results) {
    const icon = r.ok ? "✓" : r.optional ? "~" : "✗";
    const color = r.ok ? "\x1b[32m" : r.optional ? "\x1b[33m" : "\x1b[31m";
    console.log(`  ${color}${icon}\x1b[0m ${r.name}: ${r.detail}`);
    if (!r.ok && r.fix && showFixes) {
      console.log(`      fix: ${r.fix}`);
    }
  }

  const required = results.filter((r) => !r.optional);
  const passed = required.filter((r) => r.ok).length;
  console.log(`\n  ${passed}/${required.length} required checks passed.`);

  const failures = results.filter((r) => !r.ok);
  if (failures.length > 0 && !showFixes) {
    console.log(`  Run "tv-build doctor --fix" to see the exact fix for each failing check.`);
  }
  console.log();

  if (passed < required.length) {
    console.log("  Fix the required issues above before running the harness.\n");
    process.exitCode = 1;
  }
}

function checkCommand(name: string, command: string, label: string, fix?: string): CheckResult {
  try {
    const version = execSync(command, { stdio: "pipe", timeout: 10_000 }).toString().trim();
    return { name: label, ok: true, detail: version };
  } catch {
    return { name: label, ok: false, detail: "Not found.", fix };
  }
}

function checkClaudeCli(): CheckResult {
  const path = resolveClaude();
  if (path) {
    return { name: "Claude CLI", ok: true, detail: path };
  }
  return {
    name: "Claude CLI",
    ok: false,
    detail: "Not found (needed for claude-run mode).",
    fix: "npm install -g @anthropic-ai/claude-code   # or set CLAUDE_PATH=/path/to/claude",
  };
}

function checkApiKey(claudeCliAvailable: boolean): CheckResult {
  const value = process.env.ANTHROPIC_API_KEY;
  if (value && value.length > 0) {
    return { name: "Anthropic API key", ok: true, detail: `Set (${value.slice(0, 8)}...)` };
  }
  return {
    name: "Anthropic API key",
    ok: false,
    // Only one of (claude CLI, API key) is needed; if the CLI is present this is optional.
    optional: claudeCliAvailable,
    detail: claudeCliAvailable
      ? "Not set — API mode (run) unavailable, claude-run mode works."
      : "ANTHROPIC_API_KEY environment variable not set.",
    fix: "export ANTHROPIC_API_KEY=sk-ant-...   # or add it to .env",
  };
}

function checkXcode(): CheckResult {
  try {
    const version = execSync("xcodebuild -version", { stdio: "pipe", timeout: 10_000 }).toString().trim().split("\n")[0];
    return { name: "Xcode", ok: true, detail: version };
  } catch {
    return {
      name: "Xcode", ok: false, optional: true,
      detail: "Not found (needed for Apple TV builds only).",
      fix: "Install Xcode from the App Store, then: sudo xcode-select -s /Applications/Xcode.app",
    };
  }
}

function checkAndroidSDK(): CheckResult {
  const androidHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (androidHome && existsSync(androidHome)) {
    return { name: "Android SDK", ok: true, detail: androidHome };
  }
  return {
    name: "Android SDK", ok: false, optional: true,
    detail: "ANDROID_HOME not set (needed for Android TV builds only).",
    fix: 'Install Android Studio, then: export ANDROID_HOME="$HOME/Library/Android/sdk"',
  };
}

function checkEmulators(): CheckResult {
  try {
    const avds = execSync("emulator -list-avds", { stdio: "pipe", timeout: 10_000 }).toString().trim();
    // emulator prints INFO/WARNING noise on stdout — AVD names never contain spaces
    const list = avds.split("\n").filter((line) => line.trim() && !line.includes(" "));
    const tvAvd = list.find((a) => /(^|[^a-z])tv|television/i.test(a));
    if (tvAvd) {
      return { name: "Android TV AVD", ok: true, detail: tvAvd };
    }
    if (list.length > 0) {
      return {
        name: "Android TV AVD", ok: false, optional: true,
        detail: `Found AVDs but none with 'TV' in name: ${list.join(", ")}`,
        fix: 'avdmanager create avd -n TV_API_34 -k "system-images;android-34;android-tv;x86" -d tv_1080p',
      };
    }
    return {
      name: "Android TV AVD", ok: false, optional: true,
      detail: "No AVDs found.",
      fix: "Create an Android TV device in Android Studio > Device Manager",
    };
  } catch {
    return {
      name: "Android TV AVD", ok: false, optional: true,
      detail: "emulator command not found.",
      fix: 'export PATH="$PATH:$ANDROID_HOME/emulator" after installing the Android SDK',
    };
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
    return {
      name: "tvOS Runtime", ok: false, optional: true,
      detail: "No tvOS runtime installed.",
      fix: "Xcode > Settings > Platforms > add tvOS",
    };
  } catch {
    return {
      name: "tvOS Runtime", ok: false, optional: true,
      detail: "xcrun simctl not available.",
      fix: "Install Xcode command line tools: xcode-select --install",
    };
  }
}

function checkPuppeteer(): CheckResult {
  try {
    execSync('node -e "require(\'puppeteer\')"', { stdio: "pipe", timeout: 10_000 });
    return { name: "Puppeteer", ok: true, detail: "Installed (web screenshots enabled)" };
  } catch {
    return {
      name: "Puppeteer", ok: false, optional: true,
      detail: "Not found (visual QA screenshots disabled).",
      fix: "yarn add puppeteer   # in packages/harness",
    };
  }
}

function checkAgentDevice(): CheckResult {
  try {
    const version = execSync("npx agent-device --version", { stdio: "pipe", timeout: 15_000 }).toString().trim();
    return { name: "agent-device", ok: true, detail: `v${version} (Android TV emulator testing enabled)` };
  } catch {
    return {
      name: "agent-device", ok: false, optional: true,
      detail: "Not found (android_test_loop phase will be skipped).",
      fix: "npm install -g agent-device",
    };
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
    return {
      name: "Disk Space", ok: false,
      detail: `Only ${availGB} GB free. Need at least 10 GB.`,
      fix: "Free up disk space — each run clones a template and installs node_modules (~2 GB)",
    };
  } catch {
    return { name: "Disk Space", ok: true, detail: "Could not check (non-critical)." };
  }
}
