import type { Phase } from "./harness-config.js";
import type { RunContext } from "./run-context.js";

export function buildPhasePrompt(phase: Phase, ctx: RunContext, failure = ""): string {
  return [
    `Phase: ${phase.name}`,
    `Prior summary: ${ctx.summaries.at(-1) ?? "No prior phase has run."}`,
    failure && `Previous verification failed: ${failure}`,
    "Read and modify the existing React Native TV app in ./out. Preserve unrelated work.",
    "Output only JSON with summary and files.",
    phase.prompt,
  ].filter(Boolean).join("\n\n");
}
