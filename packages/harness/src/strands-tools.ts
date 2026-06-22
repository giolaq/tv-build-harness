import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

export interface StrandsToolsContext {
  appDir: string;
  workdir: string;
}

export function createStrandsTools(ctx: StrandsToolsContext) {
  const { appDir, workdir } = ctx;

  const bashTool = tool({
    name: "bash",
    description: "Execute a shell command and return its output. Use for: installing packages, running builds, git operations, file system operations, or any CLI command.",
    inputSchema: z.object({
      command: z.string().describe("The shell command to execute"),
      cwd: z.string().optional().describe("Working directory (defaults to the app directory)"),
      timeout: z.number().optional().describe("Timeout in milliseconds (default 60000)"),
    }),
    callback: async ({ command, cwd, timeout }) => {
      const execDir = cwd ?? appDir;
      try {
        const output = execSync(command, {
          cwd: execDir,
          encoding: "utf-8",
          timeout: timeout ?? 60_000,
          stdio: ["pipe", "pipe", "pipe"],
        });
        return output;
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; status?: number };
        return `Command failed (exit ${e.status ?? "?"})\nstdout: ${e.stdout ?? ""}\nstderr: ${e.stderr ?? ""}`;
      }
    },
  });

  const readFileTool = tool({
    name: "read_file",
    description: "Read the contents of a file. Returns the full file content as text.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to the app directory, or absolute path"),
    }),
    callback: async ({ path: filePath }) => {
      const resolved = filePath.startsWith("/") ? filePath : join(appDir, filePath);
      if (!existsSync(resolved)) {
        return `File not found: ${resolved}`;
      }
      return readFileSync(resolved, "utf-8");
    },
  });

  const writeFileTool = tool({
    name: "write_file",
    description: "Write content to a file. Creates parent directories if needed. Overwrites existing content.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to the app directory, or absolute path"),
      content: z.string().describe("The full file content to write"),
    }),
    callback: async ({ path: filePath, content }) => {
      const resolved = filePath.startsWith("/") ? filePath : join(appDir, filePath);
      const dir = join(resolved, "..");
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolved, content);
      return `Written: ${resolved}`;
    },
  });

  const editFileTool = tool({
    name: "edit_file",
    description: "Replace a specific string in a file. Use for targeted edits without rewriting the entire file.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to the app directory, or absolute path"),
      old_string: z.string().describe("The exact string to find and replace"),
      new_string: z.string().describe("The replacement string"),
    }),
    callback: async ({ path: filePath, old_string, new_string }) => {
      const resolved = filePath.startsWith("/") ? filePath : join(appDir, filePath);
      if (!existsSync(resolved)) {
        return `File not found: ${resolved}`;
      }
      const content = readFileSync(resolved, "utf-8");
      if (!content.includes(old_string)) {
        return `String not found in ${resolved}. The old_string must match exactly.`;
      }
      const updated = content.replace(old_string, new_string);
      writeFileSync(resolved, updated);
      return `Edited: ${resolved}`;
    },
  });

  const listFilesTool = tool({
    name: "list_files",
    description: "List files and directories at a path. Use to explore the project structure.",
    inputSchema: z.object({
      path: z.string().optional().describe("Directory path relative to app dir (defaults to app root)"),
      recursive: z.boolean().optional().describe("List recursively (default false)"),
    }),
    callback: async ({ path: dirPath, recursive }) => {
      const resolved = dirPath
        ? (dirPath.startsWith("/") ? dirPath : join(appDir, dirPath))
        : appDir;
      if (!existsSync(resolved)) {
        return `Directory not found: ${resolved}`;
      }
      if (recursive) {
        try {
          const output = execSync(`find "${resolved}" -type f -not -path "*/node_modules/*" -not -path "*/.git/*" | head -100`, {
            encoding: "utf-8",
            timeout: 10_000,
          });
          return output;
        } catch {
          return `Failed to list ${resolved}`;
        }
      }
      const entries = readdirSync(resolved, { withFileTypes: true });
      return entries.map(e => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`).join("\n");
    },
  });

  const gitTool = tool({
    name: "git",
    description: "Run a git command in the app directory. Use for commits, status, diff, log.",
    inputSchema: z.object({
      args: z.string().describe("Git arguments (e.g., 'add -A', 'commit -m \"message\"', 'status', 'diff')"),
    }),
    callback: async ({ args }) => {
      try {
        return execSync(`git ${args}`, {
          cwd: appDir,
          encoding: "utf-8",
          timeout: 30_000,
        });
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string };
        return `Git failed: ${e.stderr ?? e.stdout ?? "unknown error"}`;
      }
    },
  });

  const grepTool = tool({
    name: "grep",
    description: "Search for a pattern in files. Returns matching lines with file paths.",
    inputSchema: z.object({
      pattern: z.string().describe("Search pattern (supports regex)"),
      path: z.string().optional().describe("Directory to search in (relative to app dir, defaults to packages/shared-ui/src)"),
      include: z.string().optional().describe("File glob pattern (e.g., '*.tsx')"),
    }),
    callback: async ({ pattern, path: searchPath, include }) => {
      const dir = searchPath
        ? (searchPath.startsWith("/") ? searchPath : join(appDir, searchPath))
        : join(appDir, "packages/shared-ui/src");
      const includeFlag = include ? `--include="${include}"` : '--include="*.ts" --include="*.tsx"';
      try {
        return execSync(
          `grep -rn "${pattern.replace(/"/g, '\\"')}" "${dir}" ${includeFlag} | head -30`,
          { encoding: "utf-8", timeout: 10_000 }
        );
      } catch {
        return `No matches for "${pattern}" in ${dir}`;
      }
    },
  });

  return [
    bashTool,
    readFileTool,
    writeFileTool,
    editFileTool,
    listFilesTool,
    gitTool,
    grepTool,
  ];
}
