import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { ADBT_PACKAGE } from "../platform/vega.js";
import { runProcess } from "../process.js";

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

export class AdbtCliContextProvider implements AdbtContextProvider {
  constructor(private options: { command?: string; commandArgs?: string[]; cwd?: string; timeoutMs?: number } = {}) {}

  async load(): Promise<AdbtPortContext> {
    const catalog = parseCatalog(await this.call("list_documents", {
      documentType: "WORKFLOW",
      target_platform: { device_os: ["vega_os"] },
    }));
    for (const name of ADBT_PORT_WORKFLOWS) {
      if (!catalog.some((document) => document.name === name)) throw new AdbtContextError(`ADBT workflow missing: ${name}`);
    }
    const content = await Promise.all(ADBT_PORT_WORKFLOWS.map((name) => this.call("read_document", { document_uri: name })));
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
  }

  private async call(tool: string, args: object): Promise<string> {
    const command = this.options.command ?? "npx";
    const commandArgs = this.options.commandArgs ?? ["-y", ADBT_PACKAGE];
    const result = await runProcess(command, [...commandArgs, "exec", tool, "--args", JSON.stringify(args)], this.options.timeoutMs ?? 60_000, this.options.cwd);
    if (result.code !== 0 || result.timedOut) throw new AdbtContextError(`ADBT ${tool} failed: ${result.stderr.trim() || `exit ${result.code}`}`);
    return result.stdout.trim();
  }
}

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

function relevantSections(name: string, content: string): string {
  const wanted = name === ADBT_PORT_WORKFLOWS[0]
    ? ["Purpose", "AI Agent Instructions", "Input Sanitization", "Step 1: DETECT APP TYPE", "Step 3: DISPATCH"]
    : ["Purpose", "Architecture", "Library Compatibility Check", "Phase 2: PLAN", "Phase 3: EXECUTE", "Expected Outcomes"];
  const sections = content.split(/(?=^## )/m).filter((section) => wanted.some((heading) => section.startsWith(`## ${heading}`)));
  return (sections.join("\n").trim() || content).slice(0, 12_000);
}

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
