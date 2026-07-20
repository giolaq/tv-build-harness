import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { McpClient, type JSONValue } from "@strands-agents/sdk";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import { ADBT_PACKAGE } from "../platform/vega.js";

export const ADBT_PORT_WORKFLOWS = ["port_tv_app_to_vega.md", "port_tv_app_to_vega_fos_rn_app.md"] as const;
const DocumentSchema = z.object({ name: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), excerpt: z.string() });
export const AdbtPortContextSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(["live", "replay"]),
  packageName: z.string(),
  targetPlatform: z.literal("vega_os"),
  capturedAt: z.string(),
  documents: z.array(DocumentSchema),
});

export type AdbtPortContext = z.infer<typeof AdbtPortContextSchema>;
export interface AdbtContextProvider { load(): Promise<AdbtPortContext>; }
export class AdbtContextError extends Error {}
export interface AdbtToolClient {
  listTools(): Promise<string[]>;
  callTool(name: string, args: Record<string, JSONValue>, signal: AbortSignal): Promise<unknown>;
  disconnect(): Promise<void>;
}

export class AdbtReplayContextProvider implements AdbtContextProvider {
  constructor(private path: string) {}
  async load(): Promise<AdbtPortContext> {
    const context = AdbtPortContextSchema.parse(JSON.parse(readFileSync(this.path, "utf8")));
    for (const document of context.documents) {
      if (digest(document.excerpt) !== document.sha256) throw new Error(`ADBT replay hash mismatch: ${document.name}`);
    }
    return context;
  }
}

export class AdbtMcpContextProvider implements AdbtContextProvider {
  constructor(private options: { command?: string; commandArgs?: string[]; cwd?: string; timeoutMs?: number; clientFactory?: () => AdbtToolClient } = {}) {}

  async load(): Promise<AdbtPortContext> {
    const client = this.options.clientFactory?.() ?? createAdbtClient(this.options);
    try {
      const available = await bounded(client.listTools(), this.timeoutMs(), "tool discovery");
      for (const tool of ["list_documents", "read_document"]) {
        if (!available.includes(tool)) throw new AdbtContextError(`ADBT MCP tool missing: ${tool}`);
      }
      const catalog = parseCatalog(await this.call(client, "list_documents", {
        documentType: "WORKFLOW",
        target_platform: { device_os: ["vega_os"] },
      }));
      for (const name of ADBT_PORT_WORKFLOWS) {
        if (!catalog.some((document) => document.name === name)) throw new AdbtContextError(`ADBT workflow missing: ${name}`);
      }
      const content = await Promise.all(ADBT_PORT_WORKFLOWS.map((name) => this.call(client, "read_document", { document_uri: name })));
      return {
        schemaVersion: 1,
        mode: "live",
        packageName: ADBT_PACKAGE,
        targetPlatform: "vega_os",
        capturedAt: new Date().toISOString(),
        documents: ADBT_PORT_WORKFLOWS.map((name, index) => {
          const excerpt = relevantSections(name, content[index]);
          return { name, sha256: digest(excerpt), excerpt };
        }),
      };
    } finally {
      await client.disconnect();
    }
  }

  private async call(client: AdbtToolClient, name: string, args: Record<string, JSONValue>): Promise<string> {
    const signal = AbortSignal.timeout(this.timeoutMs());
    try {
      return mcpText(await bounded(client.callTool(name, args, signal), this.timeoutMs(), name));
    } catch (error) {
      throw new AdbtContextError(`ADBT MCP ${name} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private timeoutMs(): number { return this.options.timeoutMs ?? 60_000; }
}

/** @deprecated Use AdbtMcpContextProvider. */
export const AdbtCliContextProvider = AdbtMcpContextProvider;

export function renderAdbtPrompt(context: AdbtPortContext): string {
  const sources = context.documents.map((document) => `- ${document.name} (sha256: ${document.sha256})`).join("\n");
  const guidance = context.documents.map((document) => `### ${document.name}\n${document.excerpt}`).join("\n\n");
  return `## ADBT Vega Port Guidance\n\nMode: ${context.mode}\nSources:\n${sources}\n\n${guidance}`;
}

function parseCatalog(output: string): Array<{ name: string; description?: string }> {
  const start = output.indexOf("[");
  if (start < 0) throw new AdbtContextError("ADBT workflow catalog was not JSON");
  return z.array(z.object({ name: z.string(), description: z.string().optional() })).parse(JSON.parse(output.slice(start)));
}

function createAdbtClient(options: { command?: string; commandArgs?: string[]; cwd?: string }): AdbtToolClient {
  const mcp = new McpClient({
    applicationName: "TV Build Workshop",
    applicationVersion: "0.1.0",
    transport: new StdioClientTransport({
      command: options.command ?? "npx",
      args: options.commandArgs ?? ["-y", ADBT_PACKAGE],
      cwd: options.cwd,
      stderr: "pipe",
    }),
  });
  let tools: Awaited<ReturnType<McpClient["listTools"]>> = [];
  return {
    async listTools() { tools = await mcp.listTools(); return tools.map((tool) => tool.name); },
    async callTool(name, args, signal) {
      const target = tools.find((tool) => tool.name === name);
      if (!target) throw new Error(`tool is not available: ${name}`);
      return mcp.callTool(target, args, { signal });
    },
    disconnect: () => mcp.disconnect(),
  };
}

function mcpText(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") throw new Error("tool returned no content");
  const value = result as { content?: unknown; structuredContent?: unknown };
  if (Array.isArray(value.content)) {
    const text = value.content.flatMap((item) => item && typeof item === "object" && "text" in item && typeof item.text === "string" ? [item.text] : []).join("\n");
    if (text) return text;
  }
  if (value.structuredContent !== undefined) return JSON.stringify(value.structuredContent);
  throw new Error("tool returned no text content");
}

async function bounded<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function relevantSections(name: string, content: string): string {
  const wanted = name === ADBT_PORT_WORKFLOWS[0]
    ? ["Purpose", "AI Agent Instructions", "Input Sanitization", "Step 1: DETECT APP TYPE", "Step 3: DISPATCH"]
    : ["Purpose", "Architecture", "Library Compatibility Check", "Phase 2: PLAN", "Phase 3: EXECUTE", "Expected Outcomes"];
  const sections = content.split(/(?=^## )/m).filter((section) => wanted.some((heading) => section.startsWith(`## ${heading}`)));
  return (sections.join("\n").trim() || content).slice(0, 12_000);
}

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
