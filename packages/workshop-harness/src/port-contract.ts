import { z } from "zod";

export const PortOutputSchema = z.object({
  summary: z.string().min(1).describe("Short summary used for the verified phase commit"),
  files: z.record(
    z.string().describe("Path relative to the guarded app root"),
    z.string().describe("Complete file contents"),
  ).describe("Files proposed by the agent; the harness validates and writes them"),
});

export type PortOutput = z.infer<typeof PortOutputSchema>;
