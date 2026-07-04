import type { ZodTypeAny } from "zod";
import {
  BrandKitSchema,
  ContentManifestSchema,
  DesignTokensSchema,
  RunConfigSchema,
  ScreenTreeSchema,
} from "./types.js";
import { HarnessConfigSchema } from "./harness-config.js";

export interface InputSchemaEntry {
  name: string;
  file: string;
  description: string;
  schema: ZodTypeAny;
}

export const INPUT_SCHEMAS: InputSchemaEntry[] = [
  { name: "content", file: "content.json", description: "Content catalog, rails, videos, and featured ids.", schema: ContentManifestSchema },
  { name: "brand", file: "brand.json", description: "Brand name, colors, font, logo, and splash assets.", schema: BrandKitSchema },
  { name: "screens", file: "screens.json", description: "Optional explicit screen tree and navigation shape.", schema: ScreenTreeSchema },
  { name: "design", file: "design.json", description: "Optional visual layout and interaction preferences.", schema: DesignTokensSchema },
  { name: "run", file: "run.json", description: "Target platforms and run-level execution settings.", schema: RunConfigSchema },
  { name: "config", file: "harness.config.json", description: "Harness template, model, phase, verification, and Vega configuration.", schema: HarnessConfigSchema },
];

export function findInputSchema(name: string): InputSchemaEntry | undefined {
  return INPUT_SCHEMAS.find((entry) => entry.name === name || entry.file === name || entry.file === `${name}.json`);
}

