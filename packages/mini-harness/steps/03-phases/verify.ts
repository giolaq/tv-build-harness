import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

export const VerifySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("file_exists"), path: z.string() }),
  z.object({ type: z.literal("grep"), path: z.string(), pattern: z.string() }),
]);
export type VerifyCheck = z.infer<typeof VerifySchema>;

export function verify(check: VerifyCheck): string | null {
  const path = resolve(check.path);
  if (!path.startsWith(resolve("out"))) return `Verify path must be under ./out: ${check.path}`;
  if (!existsSync(path)) return `Missing file: ${check.path}`;
  if (check.type === "grep" && !readFileSync(path, "utf-8").includes(check.pattern)) {
    return `Pattern "${check.pattern}" not found in ${check.path}`;
  }
  return null;
}
