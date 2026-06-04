import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition, ToolHandler, ToolResult } from "../types.js";

export const removeScreenDefinition: ToolDefinition = {
  name: "remove_screen",
  description: "Remove a screen component and its references from the screens index and navigation config",
  input_schema: {
    type: "object",
    properties: {
      workdir: { type: "string", description: "Root of the template project" },
      name: { type: "string", description: "Screen name in PascalCase (e.g. 'Watchlist')" },
    },
    required: ["workdir", "name"],
  },
};

export const removeScreenHandler: ToolHandler = async (input): Promise<ToolResult> => {
  const workdir = input.workdir as string;
  const name = input.name as string;

  const screensDir = join(workdir, "packages", "shared-ui", "src", "screens");
  const screenFile = join(screensDir, `${name}Screen.tsx`);
  const removed: string[] = [];

  // Remove the screen file
  if (existsSync(screenFile)) {
    unlinkSync(screenFile);
    removed.push(screenFile);
  }

  // Remove from screens index
  const indexPath = join(screensDir, "index.ts");
  if (existsSync(indexPath)) {
    let content = readFileSync(indexPath, "utf-8");
    const lines = content.split("\n");
    const filtered = lines.filter(line => !line.includes(`${name}Screen`));
    if (filtered.length !== lines.length) {
      writeFileSync(indexPath, filtered.join("\n"));
      removed.push("screens/index.ts (export removed)");
    }
  }

  // Remove from navigation config
  const navDir = join(workdir, "packages", "shared-ui", "src", "navigation");
  if (existsSync(navDir)) {
    const navFiles = ["index.tsx", "index.ts", "DrawerNavigator.tsx", "Navigator.tsx", "routes.ts"];
    for (const navFile of navFiles) {
      const navPath = join(navDir, navFile);
      if (!existsSync(navPath)) continue;

      let content = readFileSync(navPath, "utf-8");
      const original = content;

      // Remove import lines referencing this screen
      content = content.split("\n").filter(line =>
        !line.includes(`${name}Screen`) || line.trimStart().startsWith("//")
      ).join("\n");

      // Remove route entries (common patterns)
      content = content.replace(
        new RegExp(`\\s*<[^>]*name=["']${name}["'][^>]*/?>`, "g"),
        ""
      );
      content = content.replace(
        new RegExp(`\\s*\\{[^}]*name:\\s*["']${name}["'][^}]*\\},?`, "g"),
        ""
      );

      if (content !== original) {
        writeFileSync(navPath, content);
        removed.push(`navigation/${navFile} (route removed)`);
      }
    }
  }

  if (removed.length === 0) {
    return { ok: false, output: null, error: `Screen "${name}" not found in ${screensDir}` };
  }

  return {
    ok: true,
    output: `Screen "${name}" removed. Files affected:\n${removed.map(f => `  - ${f}`).join("\n")}`,
  };
};
