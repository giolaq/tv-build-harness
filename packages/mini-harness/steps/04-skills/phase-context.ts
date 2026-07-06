import type { Phase } from "./harness-config.js";
import type { RunContext } from "./run-context.js";
import { loadSkills } from "./skills.js";

export function buildPhasePrompt(phase: Phase, ctx: RunContext, failure = ""): string {
  const skills = loadSkills(phase.skills);
  return [
    `Phase: ${phase.name}`,
    `Prior summary: ${ctx.summaries.at(-1) ?? "No prior phase has run."}`,
    failure && `Previous verification failed: ${failure}`,
    "Generate or update a three-page static site in ./out.",
    "Output only JSON with summary and files.",
    skills.length ? `Skills:\n${skills.map((s) => `## ${s.name}\n${s.body}`).join("\n\n")}` : "",
    phase.prompt,
  ].filter(Boolean).join("\n\n");
}
