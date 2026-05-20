import { execSync } from "node:child_process";
import { join } from "node:path";
import type { ToolDefinition, ToolHandler, ToolResult } from "../types.js";

export const expoPrebuildDefinition: ToolDefinition = {
  name: "expo_prebuild",
  description: "Run EXPO_TV=1 expo prebuild for a target platform (ios or android)",
  input_schema: {
    type: "object",
    properties: {
      workdir: { type: "string", description: "Root of the template project" },
      platform: { type: "string", description: "Target platform: ios or android", enum: ["ios", "android"] },
    },
    required: ["workdir", "platform"],
  },
};

export const expoPrebuildHandler: ToolHandler = async (input): Promise<ToolResult> => {
  const workdir = input.workdir as string;
  const platform = input.platform as "ios" | "android";
  const appDir = join(workdir, "apps", "expo-multi-tv");

  try {
    const output = execSync(
      `EXPO_TV=1 npx expo prebuild --platform ${platform} --no-install`,
      {
        cwd: appDir,
        stdio: "pipe",
        timeout: 300_000,
        env: { ...process.env, EXPO_TV: "1" },
      }
    ).toString();

    return {
      ok: true,
      output: `Prebuild complete for ${platform}. ${output.slice(-200)}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, output: null, error: `expo_prebuild (${platform}) failed: ${message}` };
  }
};
