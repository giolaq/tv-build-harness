import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { Expected, CheckResult } from "@tv-harness/shared-types";

export function runStructuralChecks(appPath: string, expected: Expected): CheckResult[] {
  const results: CheckResult[] = [];

  // Check files_exist
  for (const file of expected.files_exist) {
    const fullPath = join(appPath, file);
    results.push({
      level: 1,
      name: `file_exists:${file}`,
      severity: existsSync(fullPath) ? "pass" : "fail",
      message: existsSync(fullPath) ? `Found ${file}` : `Missing ${file}`,
    });
  }

  // Check files_not_exist
  for (const file of expected.files_not_exist ?? []) {
    const fullPath = join(appPath, file);
    results.push({
      level: 1,
      name: `file_not_exists:${file}`,
      severity: !existsSync(fullPath) ? "pass" : "fail",
      message: !existsSync(fullPath) ? `Correctly absent: ${file}` : `Should not exist: ${file}`,
    });
  }

  // Check nav routes by grepping the navigation directory
  // Look in packages/shared-ui/src/navigation/ for route definitions
  // The DrawerNavigator.tsx or RootNavigator.tsx should reference each route
  if (expected.nav_routes.length > 0) {
    const navDir = join(appPath, "packages/shared-ui/src/navigation");
    if (existsSync(navDir)) {
      const navContent = readdirSync(navDir)
        .filter(f => f.endsWith(".tsx") || f.endsWith(".ts"))
        .map(f => readFileSync(join(navDir, f), "utf-8"))
        .join("\n");

      for (const route of expected.nav_routes) {
        const found = navContent.includes(`name="${route}"`) || navContent.includes(`name='${route}'`) || navContent.includes(`"${route}"`);
        results.push({
          level: 1,
          name: `nav_route:${route}`,
          severity: found ? "pass" : "fail",
          message: found ? `Route "${route}" found in navigation` : `Route "${route}" missing from navigation`,
        });
      }
    } else {
      results.push({
        level: 1,
        name: "nav_directory",
        severity: "fail",
        message: "Navigation directory not found",
      });
    }
  }

  // Check theme tokens - look in theme/colors.ts for expected values
  if (expected.theme_tokens) {
    const colorsPath = join(appPath, "packages/shared-ui/src/theme/colors.ts");
    if (existsSync(colorsPath)) {
      const colorsContent = readFileSync(colorsPath, "utf-8");
      for (const [key, value] of Object.entries(expected.theme_tokens)) {
        const found = colorsContent.includes(value);
        results.push({
          level: 1,
          name: `theme_token:${key}`,
          severity: found ? "pass" : "warn",
          message: found ? `Theme token "${key}" = "${value}" found` : `Theme token "${key}" = "${value}" not found in colors.ts`,
        });
      }
    } else {
      results.push({
        level: 1,
        name: "theme_file",
        severity: "fail",
        message: "Theme colors.ts not found",
      });
    }
  }

  // Check screen count
  if (expected.screen_count !== undefined) {
    const screensDir = join(appPath, "packages/shared-ui/src/screens");
    if (existsSync(screensDir)) {
      const screens = readdirSync(screensDir).filter(f => f.endsWith("Screen.tsx"));
      const pass = screens.length >= expected.screen_count;
      results.push({
        level: 1,
        name: "screen_count",
        severity: pass ? "pass" : "fail",
        message: `Found ${screens.length} screens, expected >= ${expected.screen_count}`,
        details: { found: screens, expected: expected.screen_count },
      });
    }
  }

  // Check focus nodes - grep for SpatialNavigationFocusableView or SpatialNavigationRoot
  if (expected.focus_nodes_min !== undefined) {
    const sharedUiSrc = join(appPath, "packages/shared-ui/src");
    if (existsSync(sharedUiSrc)) {
      try {
        const grepResult = execSync(
          `grep -r "SpatialNavigationFocusableView\\|SpatialNavigationRoot" "${sharedUiSrc}" --include="*.tsx" -l`,
          { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
        ).trim();
        const focusFiles = grepResult ? grepResult.split("\n").length : 0;
        const pass = focusFiles >= expected.focus_nodes_min;
        results.push({
          level: 1,
          name: "focus_nodes",
          severity: pass ? "pass" : "fail",
          message: `Found ${focusFiles} files with focus nodes, expected >= ${expected.focus_nodes_min}`,
        });
      } catch {
        results.push({
          level: 1,
          name: "focus_nodes",
          severity: "fail",
          message: "Failed to grep for focus nodes",
        });
      }
    }
  }

  // TypeScript compilation check
  const tsconfigPath = join(appPath, "packages/shared-ui/tsconfig.json");
  if (existsSync(tsconfigPath)) {
    try {
      execSync(`npx tsc --noEmit --project "${tsconfigPath}"`, {
        cwd: appPath,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 60_000,
      });
      results.push({ level: 1, name: "tsc", severity: "pass", message: "TypeScript compilation passed" });
    } catch (err: unknown) {
      const stderr = err && typeof err === "object" && "stderr" in err ? String((err as {stderr: unknown}).stderr) : "unknown error";
      results.push({ level: 1, name: "tsc", severity: "fail", message: `TypeScript compilation failed`, details: stderr.slice(0, 500) });
    }
  }

  return results;
}
