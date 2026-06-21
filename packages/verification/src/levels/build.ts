import { execSync } from "node:child_process";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import type { Platform, CheckResult, BuildErrorClass } from "@tv-harness/shared-types";

interface BuildResult {
  platform: Platform;
  pass: boolean;
  errorClass?: BuildErrorClass;
  timeS: number;
  output?: string;
}

const BUILD_COMMANDS: Record<Platform, { cmd: string; cwd: (appPath: string) => string; check: (appPath: string) => boolean }> = {
  web: {
    cmd: "EXPO_TV=1 npx expo export --platform web",
    cwd: (appPath) => join(appPath, "apps/expo-multi-tv"),
    check: (appPath) => existsSync(join(appPath, "apps/expo-multi-tv/dist")),
  },
  androidtv: {
    cmd: "EXPO_TV=1 npx expo prebuild --platform android --no-install",
    cwd: (appPath) => join(appPath, "apps/expo-multi-tv"),
    check: (appPath) => existsSync(join(appPath, "apps/expo-multi-tv/android")),
  },
  appletv: {
    cmd: "EXPO_TV=1 npx expo prebuild --platform ios --no-install",
    cwd: (appPath) => join(appPath, "apps/expo-multi-tv"),
    check: (appPath) => existsSync(join(appPath, "apps/expo-multi-tv/ios")),
  },
  "firetv-fos": {
    cmd: "EXPO_TV=1 npx expo prebuild --platform android --no-install",
    cwd: (appPath) => join(appPath, "apps/expo-multi-tv"),
    check: (appPath) => existsSync(join(appPath, "apps/expo-multi-tv/android")),
  },
  "firetv-vega": {
    cmd: "npx kepler build",
    cwd: (appPath) => join(appPath, "apps/vega"),
    check: (appPath) => existsSync(join(appPath, "apps/vega/build")),
  },
};

function classifyError(output: string): BuildErrorClass {
  if (output.includes("Cannot find module") || output.includes("Could not resolve")) return "dependency";
  if (output.includes("error TS") || output.includes("SyntaxError")) return "compile";
  if (output.includes("app.json") || output.includes("metro.config")) return "config";
  if (output.includes("ENOENT") && (output.includes(".png") || output.includes(".jpg") || output.includes("assets"))) return "asset";
  return "unknown";
}

export function runBuildCheck(appPath: string, platform: Platform): BuildResult {
  const config = BUILD_COMMANDS[platform];
  const cwd = config.cwd(resolve(appPath));

  if (!existsSync(cwd)) {
    return { platform, pass: false, errorClass: "config", timeS: 0, output: `Working directory not found: ${cwd}` };
  }

  const start = Date.now();
  try {
    execSync(config.cmd, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 300_000,
      env: { ...process.env, EXPO_TV: "1" },
    });
    const timeS = (Date.now() - start) / 1000;
    return { platform, pass: config.check(resolve(appPath)), timeS };
  } catch (err: unknown) {
    const timeS = (Date.now() - start) / 1000;
    const output = err && typeof err === "object" && "stderr" in err
      ? String((err as {stderr: unknown}).stderr).slice(0, 2000)
      : "unknown error";
    return { platform, pass: false, errorClass: classifyError(output), timeS, output };
  }
}

export function runBuildChecks(appPath: string, platforms: Platform[]): CheckResult[] {
  return platforms.map(platform => {
    const result = runBuildCheck(appPath, platform);
    return {
      level: 2 as const,
      name: `build:${platform}`,
      severity: result.pass ? "pass" : "fail",
      message: result.pass
        ? `${platform} build passed in ${result.timeS.toFixed(1)}s`
        : `${platform} build failed: ${result.errorClass}`,
      details: { ...result },
    };
  });
}
