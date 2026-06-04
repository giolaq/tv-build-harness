import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition, ToolHandler, ToolResult } from "../types.js";

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
    const status = execSync("git status --porcelain", {
      cwd: workdir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (!status.trim()) {
      return { ok: true, output: "No changes to commit" };
    }

    execSync("git add -A", { cwd: workdir, stdio: ["pipe", "pipe", "pipe"] });
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
      cwd: workdir,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const hash = execSync("git rev-parse --short HEAD", {
      cwd: workdir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    return { ok: true, output: `Committed ${hash}: ${message}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, output: null, error: `git_commit failed: ${msg}` };
  }
};
