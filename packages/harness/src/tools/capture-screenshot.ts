import { execSync } from "node:child_process";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition, ToolHandler, ToolResult } from "../types.js";

export const captureScreenshotDefinition: ToolDefinition = {
  name: "capture_screenshot",
  description: "Capture a screenshot from a running simulator/emulator or headless browser",
  input_schema: {
    type: "object",
    properties: {
      platform: { type: "string", description: "Platform to capture", enum: ["androidtv", "appletv", "web"] },
      output_dir: { type: "string", description: "Directory to save screenshots" },
      screen_name: { type: "string", description: "Name for this screenshot (e.g. 'home', 'detail')" },
      url: { type: "string", description: "URL to capture for web platform (default: http://localhost:19006)" },
    },
    required: ["platform", "output_dir", "screen_name"],
  },
};

export const captureScreenshotHandler: ToolHandler = async (input): Promise<ToolResult> => {
  const platform = input.platform as string;
  const outputDir = input.output_dir as string;
  const screenName = input.screen_name as string;

  mkdirSync(outputDir, { recursive: true });
  const filename = `${platform}-${screenName}.png`;
  const outputPath = join(outputDir, filename);

  try {
    switch (platform) {
      case "androidtv":
        execSync(`adb exec-out screencap -p > "${outputPath}"`, { stdio: "pipe", timeout: 10_000 });
        break;
      case "appletv":
        execSync(`xcrun simctl io booted screenshot "${outputPath}"`, { stdio: "pipe", timeout: 10_000 });
        break;
      case "web": {
        const url = (input.url as string) || "http://localhost:19006";
        const script = buildPuppeteerScript(url, outputPath);
        const scriptPath = join(outputDir, `_capture_${screenName}.cjs`);
        writeFileSync(scriptPath, script);
        execSync(`node "${scriptPath}"`, { stdio: "pipe", timeout: 60_000 });
        if (!existsSync(outputPath)) {
          return { ok: false, output: null, error: `Web screenshot not created at ${outputPath}` };
        }
        break;
      }
      default:
        return { ok: false, output: null, error: `Unsupported platform for screenshot: ${platform}` };
    }

    return { ok: true, output: `Screenshot captured: ${outputPath}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, output: null, error: `capture_screenshot (${platform}) failed: ${message}` };
  }
};

function buildPuppeteerScript(url: string, outputPath: string): string {
  return `const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    headless: 'shell',
    args: ['--no-sandbox', '--window-size=1920,1080', '--mute-audio']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(${JSON.stringify(url)}, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => {
    const root = document.getElementById('root') || document.body;
    return root.querySelectorAll('[data-testid], [role="button"], [tabindex], img, [data-focusable]').length > 0;
  }, { timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: ${JSON.stringify(outputPath)} });
  await browser.close();
})();
`;
}
