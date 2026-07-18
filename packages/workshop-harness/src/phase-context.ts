import type { ProjectMemory } from "./contracts.js";

export function assembleProjectContext(memory: ProjectMemory, phase: string): { text: string; entryIds: string[] } {
  const selected = memory.entries.filter((entry) => entry.tags.length === 0 || entry.tags.includes(phase));
  const lines = selected.map((entry) => `- [${entry.section}] ${entry.text} (source: ${entry.source.kind}:${entry.source.reference})`);
  return {
    text: lines.length ? `## Approved Project Context\n\n${lines.join("\n")}` : "## Approved Project Context\n\nNo approved project context.",
    entryIds: selected.map((entry) => entry.id),
  };
}
