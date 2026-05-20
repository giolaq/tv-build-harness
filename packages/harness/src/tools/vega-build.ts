import { execSync } from "node:child_process";
import { join } from "node:path";
import type { ToolDefinition, ToolHandler, ToolResult } from "../types.js";

export const vegaBuildDefinition: ToolDefinition = {
  name: "vega_build",
  description: "Build the Vega OS variant of the app via the Vega SDK toolchain",
  input_schema: {
    type: "object",
    properties: {
      workdir: { type: "string", description: "Root of the template project" },
    },
    required: ["workdir"],
  },
};

export const vegaBuildHandler: ToolHandler = async (input): Promise<ToolResult> => {
  const workdir = input.workdir as string;
  const vegaAppDir = join(workdir, "apps", "vega");

  try {
    const output = execSync("npx kepler build", {
      cwd: vegaAppDir,
      stdio: "pipe",
      timeout: 300_000,
    }).toString();

    return {
      ok: true,
      output: `Vega build complete. ${output.slice(-200)}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, output: null, error: `vega_build failed: ${message}` };
  }
};
