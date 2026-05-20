import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition, ToolHandler, ToolResult } from "../types.js";

export const captureScreenshotDefinition: ToolDefinition = {
  name: "capture_screenshot",
  description: "Capture a screenshot from a running simulator/emulator",
  input_schema: {
    type: "object",
    properties: {
      platform: { type: "string", description: "Platform to capture", enum: ["androidtv", "appletv", "web"] },
      output_dir: { type: "string", description: "Directory to save screenshots" },
      screen_name: { type: "string", description: "Name for this screenshot (e.g. 'home', 'detail')" },
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
      case "web":
        return { ok: true, output: `Web screenshot skipped (requires headless browser). Path: ${outputPath}` };
      default:
        return { ok: false, output: null, error: `Unsupported platform for screenshot: ${platform}` };
    }

    return { ok: true, output: `Screenshot captured: ${outputPath}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, output: null, error: `capture_screenshot (${platform}) failed: ${message}` };
  }
};
