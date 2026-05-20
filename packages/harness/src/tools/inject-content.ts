import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition, ToolHandler, ToolResult } from "../types.js";
import type { ContentManifest } from "../types.js";

export const injectContentDefinition: ToolDefinition = {
  name: "inject_content",
  description: "Write content manifest to the shared-ui data directory and wire data hooks to existing screens",
  input_schema: {
    type: "object",
    properties: {
      workdir: { type: "string", description: "Root of the template project" },
      manifest: { type: "object", description: "The content manifest object" },
    },
    required: ["workdir", "manifest"],
  },
};

export const injectContentHandler: ToolHandler = async (input): Promise<ToolResult> => {
  const workdir = input.workdir as string;
  const manifest = input.manifest as ContentManifest;

  const dataDir = join(workdir, "packages", "shared-ui", "src", "data");

  try {
    mkdirSync(dataDir, { recursive: true });

    writeFileSync(join(dataDir, "content.json"), JSON.stringify(manifest, null, 2));

    const hookContent = `import contentData from './content.json';

export type Video = typeof contentData.videos[number];
export type Category = typeof contentData.categories[number];

export function useVideos() {
  return contentData.videos;
}

export function useFeatured() {
  return contentData.videos.filter((v) => contentData.featured.includes(v.id));
}

export function useCategories() {
  return contentData.categories;
}

export function useVideoById(id: string) {
  return contentData.videos.find((v) => v.id === id);
}

export function useVideosByCategory(categoryId: string) {
  const category = contentData.categories.find((c) => c.id === categoryId);
  if (!category) return [];
  return contentData.videos.filter((v) => category.items.includes(v.id));
}
`;

    writeFileSync(join(dataDir, "useContent.ts"), hookContent);

    const indexPath = join(dataDir, "index.ts");
    if (!existsSync(indexPath)) {
      writeFileSync(indexPath, `export * from './useContent';\n`);
    }

    return {
      ok: true,
      output: `Content injected: ${manifest.videos.length} videos, ${manifest.categories.length} categories, ${manifest.featured.length} featured. Data hooks written.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, output: null, error: `inject_content failed: ${message}` };
  }
};
