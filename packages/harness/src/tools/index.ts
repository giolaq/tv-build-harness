import { ToolRegistry } from "../tool-registry.js";

import { cloneTemplateDefinition, cloneTemplateHandler } from "./clone-template.js";
import { customizeMetadataDefinition, customizeMetadataHandler } from "./customize-metadata.js";
import { applyThemeDefinition, applyThemeHandler } from "./apply-theme.js";
import { replaceAssetsDefinition, replaceAssetsHandler } from "./replace-assets.js";
import { injectContentDefinition, injectContentHandler } from "./inject-content.js";
import { expoPrebuildDefinition, expoPrebuildHandler } from "./expo-prebuild.js";
import { runSimulatorDefinition, runSimulatorHandler } from "./run-simulator.js";
import { captureScreenshotDefinition, captureScreenshotHandler } from "./capture-screenshot.js";
import { runSmokeTestDefinition, runSmokeTestHandler } from "./run-smoke-test.js";
import { vegaBuildDefinition, vegaBuildHandler } from "./vega-build.js";

export function registerAllTools(registry: ToolRegistry): void {
  registry.register(cloneTemplateDefinition, cloneTemplateHandler);
  registry.register(customizeMetadataDefinition, customizeMetadataHandler);
  registry.register(applyThemeDefinition, applyThemeHandler);
  registry.register(replaceAssetsDefinition, replaceAssetsHandler);
  registry.register(injectContentDefinition, injectContentHandler);
  registry.register(expoPrebuildDefinition, expoPrebuildHandler);
  registry.register(runSimulatorDefinition, runSimulatorHandler);
  registry.register(captureScreenshotDefinition, captureScreenshotHandler);
  registry.register(runSmokeTestDefinition, runSmokeTestHandler);
  registry.register(vegaBuildDefinition, vegaBuildHandler);
}
