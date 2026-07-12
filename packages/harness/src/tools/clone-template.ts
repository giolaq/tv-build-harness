import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition, ToolHandler, ToolResult } from "../types.js";
import { commandRunner } from "../process/command-runner.js";

const DEFAULT_TEMPLATE_REPO = "https://github.com/AmazonAppDev/react-native-multi-tv-app-sample.git";
const DEFAULT_TEMPLATE_COMMIT = "5c9dc393fdbc736dc10aa4285b90cf348ff3f846";

export const cloneTemplateDefinition: ToolDefinition = {
  name: "scaffold",
  description: "Clone the app template, strip git history, and install dependencies",
  input_schema: {
    type: "object",
    properties: {
      target_dir: { type: "string", description: "Directory to clone into" },
      app_name: { type: "string", description: "Name for the new app" },
      repo: { type: "string", description: "Template git repo URL (defaults to the configured template)" },
      commit: { type: "string", description: "Pinned template commit SHA" },
    },
    required: ["target_dir", "app_name"],
  },
};

export const cloneTemplateHandler: ToolHandler = async (input): Promise<ToolResult> => {
  const targetDir = input.target_dir as string;
  const appName = input.app_name as string;
  const TEMPLATE_REPO = (input.repo as string) || process.env.TV_HARNESS_TEMPLATE_REPO || DEFAULT_TEMPLATE_REPO;
  const TEMPLATE_COMMIT = (input.commit as string) || process.env.TV_HARNESS_TEMPLATE_COMMIT || DEFAULT_TEMPLATE_COMMIT;

  if (existsSync(join(targetDir, "package.json"))) {
    return { ok: true, output: `Template already exists at ${targetDir}` };
  }

  try {
    await requireSuccess("clone", await commandRunner.run({ command: "git", args: ["clone", TEMPLATE_REPO, targetDir], timeoutMs: 60_000 }));
    await requireSuccess("checkout", await commandRunner.run({ command: "git", args: ["checkout", "--detach", TEMPLATE_COMMIT], cwd: targetDir, timeoutMs: 60_000 }));
    await requireSuccess("remove history", await commandRunner.run({ command: "rm", args: ["-rf", join(targetDir, ".git")], timeoutMs: 30_000 }));
    await requireSuccess("git init", await commandRunner.run({ command: "git", args: ["init"], cwd: targetDir, timeoutMs: 30_000 }));
    await requireSuccess("install", await commandRunner.run({ command: "yarn", args: ["install"], cwd: targetDir, timeoutMs: 120_000 }));

    return {
      ok: true,
      output: `Template cloned to ${targetDir}, git history stripped, deps installed. App name: ${appName}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, output: null, error: `scaffold failed: ${message}` };
  }
};

async function requireSuccess(step: string, result: { exitCode: number | null; stderr: string; stdout: string }): Promise<void> {
  if (result.exitCode !== 0) throw new Error(`${step} failed: ${result.stderr || result.stdout || `exit ${result.exitCode}`}`);
}
