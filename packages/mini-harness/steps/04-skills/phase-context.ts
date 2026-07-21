import type { Phase } from "./harness-config.js";
import type { RunContext } from "./run-context.js";

export function buildPhasePrompt(phase: Phase, ctx: RunContext, failure = ""): string {
  return [
    `Phase: ${phase.name}`,
    `Prior summary: ${ctx.summaries.at(-1) ?? "No prior phase has run."}`,
    failure && `Previous verification failed: ${failure}`,
    "Generate or update a three-page static site in ./out.",
    "Output only JSON with summary and files.",
    phase.prompt,
  ].filter(Boolean).join("\n\n");
}
