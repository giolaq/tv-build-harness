import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { VerifySchema } from "./verify.js";

export const PhaseSchema = z.object({
  name: z.string(),
  prompt: z.string(),
  verify: VerifySchema,
  skills: z.array(z.string()).default([]),
});
export type Phase = z.infer<typeof PhaseSchema>;

export function loadHarnessConfig(path: string): Phase[] {
  return z.object({ phases: z.array(PhaseSchema).min(1) })
    .parse(JSON.parse(readFileSync(resolve(path), "utf-8"))).phases;
}
