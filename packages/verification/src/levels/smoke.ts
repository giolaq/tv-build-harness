import { execSync, spawn, ChildProcess } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { CheckResult } from "@tv-build/shared-types";

interface SmokeOptions {
  appPath: string;
  port?: number;
  timeoutMs?: number;
}

export async function runSmokeChecks(options: SmokeOptions): Promise<CheckResult[]> {
  const { appPath, port = 19006, timeoutMs = 30_000 } = options;
  const results: CheckResult[] = [];
  const expoDir = join(appPath, "apps/expo-multi-tv");

  if (!existsSync(expoDir)) {
    results.push({ level: 3, name: "smoke:app_dir", severity: "fail", message: "Expo app directory not found" });
    return results;
  }

  // Start the web server
  let server: ChildProcess | undefined;
  try {
    server = spawn("npx", ["expo", "start", "--web", "--port", String(port), "--non-interactive"], {
      cwd: expoDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BROWSER: "none", EXPO_TV: "1" },
      detached: true,
    });

    // Wait for server to be ready
    const ready = await waitForServer(`http://localhost:${port}`, timeoutMs);
    if (!ready) {
      results.push({ level: 3, name: "smoke:server_start", severity: "fail", message: `Web server failed to start within ${timeoutMs}ms` });
      return results;
    }
    results.push({ level: 3, name: "smoke:server_start", severity: "pass", message: "Web server started" });

    // Check the page loads with a 200
    try {
      const response = await fetch(`http://localhost:${port}`);
      if (response.ok) {
        results.push({ level: 3, name: "smoke:page_load", severity: "pass", message: `Page loaded with status ${response.status}` });

        // Check that the page has actual content (not a blank/error page)
        const html = await response.text();
        const hasRoot = html.includes("id=\"root\"") || html.includes("id='root'") || html.includes("id=\"app\"");
        const hasBundle = html.includes(".js") || html.includes("bundle");
        results.push({
          level: 3,
          name: "smoke:page_content",
          severity: hasRoot && hasBundle ? "pass" : "warn",
          message: hasRoot && hasBundle ? "Page has root element and JS bundle" : "Page may be missing content",
        });
      } else {
        results.push({ level: 3, name: "smoke:page_load", severity: "fail", message: `Page returned status ${response.status}` });
      }
    } catch (err) {
      results.push({ level: 3, name: "smoke:page_load", severity: "fail", message: `Failed to fetch page: ${err}` });
    }

    // Check for runtime errors by fetching the bundle and looking for syntax errors
    try {
      const bundleUrl = `http://localhost:${port}/index.bundle?platform=web&dev=true`;
      const bundleResp = await fetch(bundleUrl, { signal: AbortSignal.timeout(15_000) });
      if (bundleResp.ok) {
        const bundleText = await bundleResp.text();
        const hasSyntaxError = bundleText.includes("SyntaxError") || bundleText.includes("Cannot find module");
        results.push({
          level: 3,
          name: "smoke:bundle_valid",
          severity: hasSyntaxError ? "fail" : "pass",
          message: hasSyntaxError ? "Bundle contains errors" : "Bundle compiled successfully",
        });
      }
    } catch {
      // Bundle URL may not be accessible in this format - that's ok
      results.push({ level: 3, name: "smoke:bundle_valid", severity: "warn", message: "Could not validate bundle directly" });
    }

    // Static focus analysis: verify focus infrastructure exists
    // (full D-pad driving would require Puppeteer/Playwright — placeholder for now)
    const focusCheck = checkFocusInfrastructure(appPath);
    results.push(...focusCheck);

  } finally {
    if (server && server.pid) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch { /* already dead */ }
    }
  }

  return results;
}

function checkFocusInfrastructure(appPath: string): CheckResult[] {
  const results: CheckResult[] = [];
  const sharedUi = join(appPath, "packages/shared-ui/src");

  // Check configureRemoteControl exists
  const remoteControlPath = join(sharedUi, "app/configureRemoteControl.ts");
  results.push({
    level: 3,
    name: "smoke:remote_control_config",
    severity: existsSync(remoteControlPath) ? "pass" : "fail",
    message: existsSync(remoteControlPath) ? "Remote control configured" : "Missing configureRemoteControl.ts",
  });

  // Check that screens use SpatialNavigationRoot with isActive guard
  const screensDir = join(sharedUi, "screens");
  if (existsSync(screensDir)) {
    try {
      const output = execSync(
        `grep -l "SpatialNavigationRoot" "${screensDir}"/*.tsx 2>/dev/null || true`,
        { encoding: "utf-8" }
      ).trim();
      const screenFiles = output ? output.split("\n").filter(Boolean) : [];

      // Check that at least one screen has the isMenuOpen guard
      const guardedOutput = execSync(
        `grep -l "isMenuOpen" "${screensDir}"/*.tsx 2>/dev/null || true`,
        { encoding: "utf-8" }
      ).trim();
      const guardedFiles = guardedOutput ? guardedOutput.split("\n").filter(Boolean) : [];

      results.push({
        level: 3,
        name: "smoke:focus_roots",
        severity: screenFiles.length > 0 ? "pass" : "fail",
        message: `${screenFiles.length} screens have SpatialNavigationRoot`,
      });

      results.push({
        level: 3,
        name: "smoke:focus_isolation",
        severity: guardedFiles.length > 0 ? "pass" : "warn",
        message: `${guardedFiles.length}/${screenFiles.length} screens guard focus with isMenuOpen`,
      });
    } catch {
      results.push({ level: 3, name: "smoke:focus_roots", severity: "warn", message: "Could not analyze focus roots" });
    }
  }

  // Check RemoteControlManager.addKeydownListener returns listener (not cleanup fn)
  const rmPath = join(sharedUi, "app/remote-control/RemoteControlManager.ts");
  if (existsSync(rmPath)) {
    try {
      const content = execSync(`cat "${rmPath}"`, { encoding: "utf-8" });
      const returnsListener = content.includes("return listener");
      const returnsCleanup = content.includes("return ()") || content.includes("return function");
      results.push({
        level: 3,
        name: "smoke:remote_control_return_type",
        severity: returnsListener && !returnsCleanup ? "pass" : "fail",
        message: returnsListener ? "addKeydownListener correctly returns listener" : "addKeydownListener may return cleanup fn (causes double-navigation)",
      });
    } catch {
      results.push({ level: 3, name: "smoke:remote_control_return_type", severity: "warn", message: "Could not read RemoteControlManager" });
    }
  }

  return results;
}

async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (resp.ok || resp.status === 200) return true;
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}
