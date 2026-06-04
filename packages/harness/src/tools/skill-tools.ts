import type { ToolDefinition, ToolHandler, ToolResult } from "../types.js";
import { SkillLibrary } from "../skill-library.js";

let sharedSkillLibrary: SkillLibrary | null = null;

export function setSkillLibrary(lib: SkillLibrary): void {
  sharedSkillLibrary = lib;
}

export const requestSkillLoadDefinition: ToolDefinition = {
  name: "request_skill_load",
  description: "Load a skill that wasn't auto-loaded for the current phase. Returns the skill content for the next turn.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Name of the skill to load (e.g. 'spatial-navigation', 'theming')" },
    },
    required: ["name"],
  },
};

export const requestSkillLoadHandler: ToolHandler = async (input): Promise<ToolResult> => {
  if (!sharedSkillLibrary) {
    return { ok: false, output: null, error: "Skill library not initialized" };
  }

  const name = input.name as string;
  const result = sharedSkillLibrary.loadOnDemand(name);

  if (!result.ok) {
    return {
      ok: false,
      output: null,
      error: `${result.error}${result.suggested?.length ? `. Did you mean: ${result.suggested.join(", ")}?` : ""}`,
    };
  }

  return { ok: true, output: result.content };
};

export const listSkillsDefinition: ToolDefinition = {
  name: "list_skills",
  description: "List available skills in the library. Returns names and descriptions.",
  input_schema: {
    type: "object",
    properties: {
      scope: {
        type: "string",
        description: "Filter scope: 'core' (built-in), 'auto' (generated), or 'all'",
      },
    },
  },
};

export const listSkillsHandler: ToolHandler = async (input): Promise<ToolResult> => {
  if (!sharedSkillLibrary) {
    return { ok: false, output: null, error: "Skill library not initialized" };
  }

  const scope = (input.scope as "core" | "auto" | "all") ?? "all";
  const skills = sharedSkillLibrary.listSkills(scope);

  const listing = skills.map((s) => ({
    name: s.name,
    applies_to: s.applies_to,
  }));

  return { ok: true, output: listing };
};

export const writeAutoSkillDefinition: ToolDefinition = {
  name: "write_auto_skill",
  description: "Create a new auto-generated skill from a solved problem. Must be ≥500 chars with a Gotchas/Anti-pattern section and code example.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Skill name (kebab-case, e.g. 'tv-modal-focus')" },
      applies_to: {
        type: "array",
        items: { type: "string" },
        description: "Phases this skill applies to",
      },
      content: { type: "string", description: "Full markdown content of the skill (must include ## Gotchas or ## Anti-pattern section and a code example)" },
    },
    required: ["name", "applies_to", "content"],
  },
};

export const writeAutoSkillHandler: ToolHandler = async (input): Promise<ToolResult> => {
  if (!sharedSkillLibrary) {
    return { ok: false, output: null, error: "Skill library not initialized" };
  }

  const name = input.name as string;
  const applies_to = input.applies_to as string[];
  const content = input.content as string;

  const result = sharedSkillLibrary.createAutoSkill(name, { applies_to }, content);

  if (!result.ok) {
    return { ok: false, output: null, error: result.error };
  }

  return { ok: true, output: `Skill "${name}" created successfully. It will be available for future phases.` };
};
