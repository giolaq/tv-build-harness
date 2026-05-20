import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import type { ToolDefinition, ToolHandler, ToolResult } from "../types.js";

export const replaceAssetsDefinition: ToolDefinition = {
  name: "replace_assets",
  description: "Replace logo, splash, and icon assets in the template with brand assets",
  input_schema: {
    type: "object",
    properties: {
      workdir: { type: "string", description: "Root of the template project" },
      logo_path: { type: "string", description: "Path to brand logo file" },
      splash_path: { type: "string", description: "Path to splash screen image" },
    },
    required: ["workdir"],
  },
};

export const replaceAssetsHandler: ToolHandler = async (input): Promise<ToolResult> => {
  const workdir = input.workdir as string;
  const logoPath = input.logo_path as string | undefined;
  const splashPath = input.splash_path as string | undefined;

  const assetsDir = join(workdir, "apps", "expo-multi-tv", "assets");
  mkdirSync(assetsDir, { recursive: true });

  const replaced: string[] = [];

  try {
    if (logoPath && existsSync(logoPath)) {
      const dest = join(assetsDir, `logo${extOf(logoPath)}`);
      copyFileSync(logoPath, dest);
      replaced.push(`logo → ${basename(dest)}`);
    }

    if (splashPath && existsSync(splashPath)) {
      const dest = join(assetsDir, `splash${extOf(splashPath)}`);
      copyFileSync(splashPath, dest);
      replaced.push(`splash → ${basename(dest)}`);
    }

    if (replaced.length === 0) {
      return { ok: true, output: "No assets provided; using template defaults." };
    }

    return { ok: true, output: `Assets replaced: ${replaced.join(", ")}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, output: null, error: `replace_assets failed: ${message}` };
  }
};

function extOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot) : "";
}
