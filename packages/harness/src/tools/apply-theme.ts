import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition, ToolHandler, ToolResult } from "../types.js";

export const applyThemeDefinition: ToolDefinition = {
  name: "apply_theme",
  description: "Replace theme tokens in packages/shared-ui/theme/ with brand kit colors and fonts",
  input_schema: {
    type: "object",
    properties: {
      workdir: { type: "string", description: "Root of the template project" },
      primary_color: { type: "string", description: "Primary brand color (#RRGGBB)" },
      accent_color: { type: "string", description: "Accent color (#RRGGBB)" },
      background_color: { type: "string", description: "Background color (#RRGGBB)" },
      font_family: { type: "string", description: "Font family name" },
    },
    required: ["workdir", "primary_color", "accent_color", "background_color"],
  },
};

export const applyThemeHandler: ToolHandler = async (input): Promise<ToolResult> => {
  const workdir = input.workdir as string;
  const primary = input.primary_color as string;
  const accent = input.accent_color as string;
  const background = input.background_color as string;
  const font = input.font_family as string | undefined;

  const themeDir = join(workdir, "packages", "shared-ui", "src", "theme");

  if (!existsSync(themeDir)) {
    return { ok: false, output: null, error: `Theme directory not found at ${themeDir}` };
  }

  try {
    let filesPatched = 0;

    const patchFile = (filePath: string) => {
      let content = readFileSync(filePath, "utf-8");
      const original = content;

      content = content.replace(/#[0-9A-Fa-f]{6}\b/g, (match) => {
        if (content.indexOf(match) === content.indexOf(match, content.indexOf("primary"))) {
          return primary;
        }
        return match;
      });

      const tokenReplacements: Record<string, string> = {
        primaryColor: primary,
        accentColor: accent,
        backgroundColor: background,
      };

      for (const [token, value] of Object.entries(tokenReplacements)) {
        const regex = new RegExp(`(${token}[\\s]*[:=][\\s]*['"])#[0-9A-Fa-f]{6}`, "g");
        content = content.replace(regex, `$1${value}`);
      }

      if (font) {
        content = content.replace(/fontFamily[:\s]*['"][^'"]+['"]/g, `fontFamily: '${font}'`);
      }

      if (content !== original) {
        writeFileSync(filePath, content);
        filesPatched++;
      }
    };

    const files = readdirSync(themeDir).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    for (const file of files) {
      patchFile(join(themeDir, file));
    }

    return {
      ok: true,
      output: `Theme applied: primary=${primary}, accent=${accent}, bg=${background}. ${filesPatched} files patched.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, output: null, error: `apply_theme failed: ${message}` };
  }
};
