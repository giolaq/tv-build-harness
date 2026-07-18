import { z } from "zod";

export const SourceSchema = z.object({
  kind: z.enum(["human", "file", "bee"]),
  reference: z.string().min(1),
});

export const MemoryEntrySchema = z.object({
  id: z.string().min(1),
  section: z.enum(["product_decision", "constraint", "convention", "open_question"]),
  text: z.string().min(1),
  source: SourceSchema,
  approvedAt: z.string().datetime(),
  tags: z.array(z.string()).default([]),
});

export const ProjectMemorySchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string().datetime(),
  entries: z.array(MemoryEntrySchema),
});

export const ContextSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  provider: z.enum(["bee", "file"]),
  capturedAt: z.string().datetime(),
  query: z.string(),
  sources: z.array(z.object({ id: z.string(), recordedAt: z.string() })),
  decisions: z.array(z.string()),
  constraints: z.array(z.string()),
  openQuestions: z.array(z.string()),
  summaryHash: z.string(),
});

export type ProjectMemory = z.infer<typeof ProjectMemorySchema>;
export type ContextSnapshot = z.infer<typeof ContextSnapshotSchema>;

export type AuditFinding = {
  area: string;
  classification: "portable" | "replace" | "manual" | "out_of_scope";
  evidence: string;
  recommendation: string;
};
