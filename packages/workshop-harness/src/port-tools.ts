import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { tool, type InvokableTool, type JSONValue } from "@strands-agents/sdk";
import { z } from "zod";

const BLOCKED = new Set([".git", "node_modules", ".env"]);
const MAX_FILES = 300;
const MAX_FILE_BYTES = 100_000;

export function createProjectReadTools(appDir: string): InvokableTool<unknown, JSONValue>[] {
  const root = realpathSync(appDir);
  return [
    tool({
      name: "list_project_files",
      description: "List files under a directory in the guarded app. Use this before reading files.",
      inputSchema: z.object({ path: z.string().default(".").describe("Directory relative to the app root") }),
      callback: ({ path }) => listFiles(root, path).join("\n"),
    }),
    tool({
      name: "read_project_file",
      description: "Read one text file from the guarded app. Cannot read secrets, dependencies, or files outside the app.",
      inputSchema: z.object({ path: z.string().min(1).describe("File path relative to the app root") }),
      callback: ({ path }) => readText(root, path),
    }),
    tool({
      name: "search_project",
      description: "Find a literal string in text files in the guarded app. Returns path, line number, and matching line.",
      inputSchema: z.object({
        query: z.string().min(1).max(200).describe("Literal text to find"),
        path: z.string().default(".").describe("Directory relative to the app root"),
      }),
      callback: ({ query, path }) => search(root, path, query),
    }),
  ];
}

function listFiles(root: string, input: string): string[] {
  const start = safePath(root, input);
  if (!statSync(start).isDirectory()) throw new Error(`Not a directory: ${input}`);
  const files: string[] = [];
  walk(start, files, root);
  return files.sort().slice(0, MAX_FILES);
}

function walk(dir: string, files: string[], root: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (BLOCKED.has(entry.name) || files.length >= MAX_FILES) continue;
    const path = resolve(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) walk(path, files, root);
    else if (entry.isFile()) files.push(relative(root, path));
  }
}

function readText(root: string, input: string): string {
  const path = safePath(root, input);
  const stat = statSync(path);
  if (!stat.isFile()) throw new Error(`Not a file: ${input}`);
  if (stat.size > MAX_FILE_BYTES) throw new Error(`File is larger than ${MAX_FILE_BYTES} bytes: ${input}`);
  const value = readFileSync(path);
  if (value.includes(0)) throw new Error(`Binary files are not readable: ${input}`);
  return value.toString("utf8");
}

function search(root: string, input: string, query: string): string {
  const matches: string[] = [];
  for (const file of listFiles(root, input)) {
    let text: string;
    try { text = readText(root, file); } catch { continue; }
    text.split("\n").forEach((line, index) => {
      if (matches.length < 50 && line.toLowerCase().includes(query.toLowerCase())) matches.push(`${file}:${index + 1}: ${line}`);
    });
  }
  return matches.join("\n") || "No matches";
}

function safePath(root: string, input: string): string {
  if (isAbsolute(input)) throw new Error(`Absolute paths are not allowed: ${input}`);
  const parts = input.split(/[\\/]/).filter(Boolean);
  if (parts.some((part) => part === ".." || BLOCKED.has(part) || part.startsWith(".env"))) throw new Error(`Protected path: ${input}`);
  const path = resolve(root, input);
  if (path !== root && !path.startsWith(`${root}${sep}`)) throw new Error(`Path escapes the app: ${input}`);
  const real = realpathSync(path);
  if (real !== root && !real.startsWith(`${root}${sep}`)) throw new Error(`Path escapes the app: ${input}`);
  return real;
}
