import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition, ToolHandler, ToolResult } from "../types.js";

export const installDepDefinition: ToolDefinition = {
  name: "install_dep",
  description: "Install a package dependency into a specific workspace of the monorepo using yarn workspaces",
  input_schema: {
    type: "object",
    properties: {
      workdir: { type: "string", description: "Root of the monorepo project" },
      package: { type: "string", description: "Package name (e.g. 'react-native-reanimated', '@react-navigation/stack@^6.0.0')" },
      workspace: {
        type: "string",
        description: "Target workspace name (e.g. 'expo-multi-tv', '@multi-tv/shared-ui')",
      },
      dev: { type: "boolean", description: "Install as devDependency (default: false)" },
    },
    required: ["workdir", "package", "workspace"],
  },
};

export const installDepHandler: ToolHandler = async (input): Promise<ToolResult> => {
  const workdir = input.workdir as string;
  const pkg = input.package as string;
  const workspace = input.workspace as string;
  const dev = (input.dev as boolean) ?? false;

  if (!existsSync(join(workdir, "package.json"))) {
    return { ok: false, output: null, error: `No package.json at ${workdir} — not a valid project root` };
  }

  // Validate package name (basic sanity)
  if (!pkg.match(/^[@a-z0-9][a-z0-9._\-/@^~>=<*]*$/i)) {
    return { ok: false, output: null, error: `Invalid package name: ${pkg}` };
  }

  const devFlag = dev ? " -D" : "";
  const cmd = `yarn workspace ${workspace} add${devFlag} ${pkg}`;

  try {
    const output = execSync(cmd, {
      cwd: workdir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120_000,
    });

    return {
      ok: true,
      output: `Installed ${pkg} in workspace ${workspace}${dev ? " (dev)" : ""}.\n${output.slice(0, 200)}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, output: null, error: `install_dep failed: ${message.slice(0, 300)}` };
  }
};
