import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition, ToolHandler, ToolResult } from "../types.js";

const TEMPLATE_REPO = "https://github.com/AmazonAppDev/react-native-multi-tv-app-sample.git";

export const cloneTemplateDefinition: ToolDefinition = {
  name: "scaffold",
  description: "Clone the react-native-multi-tv-app-sample template, strip git history, and install dependencies",
  input_schema: {
    type: "object",
    properties: {
      target_dir: { type: "string", description: "Directory to clone into" },
      app_name: { type: "string", description: "Name for the new app" },
    },
    required: ["target_dir", "app_name"],
  },
};

export const cloneTemplateHandler: ToolHandler = async (input): Promise<ToolResult> => {
  const targetDir = input.target_dir as string;
  const appName = input.app_name as string;

  if (existsSync(join(targetDir, "package.json"))) {
    return { ok: true, output: `Template already exists at ${targetDir}` };
  }

  try {
    execSync(`git clone --depth 1 ${TEMPLATE_REPO} "${targetDir}"`, {
      stdio: "pipe",
      timeout: 60_000,
    });

    execSync(`rm -rf "${join(targetDir, ".git")}"`, { stdio: "pipe" });
    execSync(`git init`, { cwd: targetDir, stdio: "pipe" });

    execSync("yarn install", {
      cwd: targetDir,
      stdio: "pipe",
      timeout: 120_000,
    });

    return {
      ok: true,
      output: `Template cloned to ${targetDir}, git history stripped, deps installed. App name: ${appName}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, output: null, error: `scaffold failed: ${message}` };
  }
};
