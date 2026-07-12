import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition, ToolHandler, ToolResult } from "../types.js";
import { commandRunner } from "../process/command-runner.js";

export const gitCommitDefinition: ToolDefinition = {
  name: "git_commit",
  description: "Create a git commit in the generated app directory to snapshot progress after a successful phase",
  input_schema: {
    type: "object",
    properties: {
      workdir: { type: "string", description: "Root of the app project (with .git)" },
      message: { type: "string", description: "Commit message describing what changed" },
    },
    required: ["workdir", "message"],
  },
};

export const gitCommitHandler: ToolHandler = async (input): Promise<ToolResult> => {
  const workdir = input.workdir as string;
  const message = input.message as string;

  if (!existsSync(join(workdir, ".git"))) {
    return { ok: false, output: null, error: "Not a git repository" };
  }

  try {
    const status = await commandRunner.run({ command: "git", args: ["status", "--porcelain"], cwd: workdir, timeoutMs: 30_000 });
    if (status.exitCode !== 0) throw new Error(status.stderr || "git status failed");

    if (!status.stdout.trim()) {
      return { ok: true, output: "No changes to commit" };
    }

    const add = await commandRunner.run({ command: "git", args: ["add", "-A"], cwd: workdir, timeoutMs: 30_000 });
    if (add.exitCode !== 0) throw new Error(add.stderr || "git add failed");
    const commit = await commandRunner.run({ command: "git", args: ["commit", "-m", message], cwd: workdir, timeoutMs: 30_000 });
    if (commit.exitCode !== 0) throw new Error(commit.stderr || "git commit failed");
    const hashResult = await commandRunner.run({ command: "git", args: ["rev-parse", "--short", "HEAD"], cwd: workdir, timeoutMs: 30_000 });
    if (hashResult.exitCode !== 0) throw new Error(hashResult.stderr || "git rev-parse failed");
    const hash = hashResult.stdout.trim();

    return { ok: true, output: `Committed ${hash}: ${message}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, output: null, error: `git_commit failed: ${msg}` };
  }
};
