import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ContextSnapshotSchema, ProjectMemorySchema, type ContextSnapshot, type ProjectMemory } from "./contracts.js";

const JSON_NAME = "project-context.json";
const MD_NAME = "PROJECT_CONTEXT.md";

export function loadMemory(dir: string): ProjectMemory {
  const path = join(resolve(dir), JSON_NAME);
  if (!existsSync(path)) return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), entries: [] };
  return ProjectMemorySchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function loadSnapshot(path: string): ContextSnapshot {
  return ContextSnapshotSchema.parse(JSON.parse(readFileSync(resolve(path), "utf8")));
}

export function propose(snapshot: ContextSnapshot): ProjectMemory["entries"] {
  const at = new Date().toISOString();
  const source = { kind: snapshot.provider, reference: snapshot.sources.map((item) => item.id).join(",") } as const;
  return [
    ...snapshot.decisions.map((text) => ({ id: randomUUID(), section: "product_decision" as const, text, source, approvedAt: at, tags: [] })),
    ...snapshot.constraints.map((text) => ({ id: randomUUID(), section: "constraint" as const, text, source, approvedAt: at, tags: [] })),
    ...snapshot.openQuestions.map((text) => ({ id: randomUUID(), section: "open_question" as const, text, source, approvedAt: at, tags: [] })),
  ];
}

export function applyProposal(dir: string, entries: ProjectMemory["entries"]): ProjectMemory {
  const current = loadMemory(dir);
  const next = ProjectMemorySchema.parse({ schemaVersion: 1, updatedAt: new Date().toISOString(), entries: [...current.entries, ...entries] });
  mkdirSync(resolve(dir), { recursive: true });
  writeFileSync(join(resolve(dir), JSON_NAME), JSON.stringify(next, null, 2));
  writeFileSync(join(resolve(dir), MD_NAME), renderMemory(next));
  return next;
}

export function renderMemory(memory: ProjectMemory): string {
  const labels = { product_decision: "Product Decisions", constraint: "Constraints", convention: "Conventions", open_question: "Open Questions" };
  const body = Object.entries(labels).map(([section, label]) => {
    const items = memory.entries.filter((entry) => entry.section === section).map((entry) => `- ${entry.text} <!-- ${entry.id}; ${entry.source.kind}:${entry.source.reference} -->`);
    return `## ${label}\n\n${items.length ? items.join("\n") : "_None._"}`;
  });
  return `# Project Context\n\nApproved context only. Open questions are not decisions.\n\n${body.join("\n\n")}\n`;
}

export function snapshotHash(value: Omit<ContextSnapshot, "summaryHash">): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}
