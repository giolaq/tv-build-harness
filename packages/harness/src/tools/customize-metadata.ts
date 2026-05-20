import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition, ToolHandler, ToolResult } from "../types.js";

export const customizeMetadataDefinition: ToolDefinition = {
  name: "customize_app_metadata",
  description: "Patch app.json, package.json, and monorepo root with new app name, slug, and bundle ID",
  input_schema: {
    type: "object",
    properties: {
      workdir: { type: "string", description: "Root of the template project" },
      app_name: { type: "string", description: "Display name of the app" },
      slug: { type: "string", description: "URL-safe slug for the app" },
      bundle_id: { type: "string", description: "Bundle identifier (e.g. com.example.myapp)" },
    },
    required: ["workdir", "app_name", "slug"],
  },
};

export const customizeMetadataHandler: ToolHandler = async (input): Promise<ToolResult> => {
  const workdir = input.workdir as string;
  const appName = input.app_name as string;
  const slug = input.slug as string;
  const bundleId = (input.bundle_id as string) ?? `com.tvharness.${slug}`;

  try {
    const appJsonPath = join(workdir, "apps", "expo-multi-tv", "app.json");
    const appJson = JSON.parse(readFileSync(appJsonPath, "utf-8"));

    appJson.expo = appJson.expo ?? {};
    appJson.expo.name = appName;
    appJson.expo.slug = slug;
    appJson.expo.ios = appJson.expo.ios ?? {};
    appJson.expo.ios.bundleIdentifier = bundleId;
    appJson.expo.android = appJson.expo.android ?? {};
    appJson.expo.android.package = bundleId;

    writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2));

    const rootPkgPath = join(workdir, "package.json");
    const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf-8"));
    rootPkg.name = slug;
    writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2));

    return {
      ok: true,
      output: `Metadata updated: name="${appName}", slug="${slug}", bundleId="${bundleId}"`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, output: null, error: `customize_app_metadata failed: ${message}` };
  }
};
