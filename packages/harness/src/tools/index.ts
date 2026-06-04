import { ToolRegistry } from "../tool-registry.js";
import { SkillLibrary } from "../skill-library.js";

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
import { gitCommitDefinition, gitCommitHandler } from "./git-commit.js";
import { addScreenDefinition, addScreenHandler } from "./add-screen.js";
import { removeScreenDefinition, removeScreenHandler } from "./remove-screen.js";
import { installDepDefinition, installDepHandler } from "./install-dep.js";
import { focusCheckDefinition, focusCheckHandler } from "./focus-check.js";
import {
  requestSkillLoadDefinition, requestSkillLoadHandler,
  listSkillsDefinition, listSkillsHandler,
  writeAutoSkillDefinition, writeAutoSkillHandler,
  setSkillLibrary,
} from "./skill-tools.js";

export function registerAllTools(registry: ToolRegistry, skillLibrary?: SkillLibrary): void {
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
  registry.register(gitCommitDefinition, gitCommitHandler);
  registry.register(addScreenDefinition, addScreenHandler);
  registry.register(removeScreenDefinition, removeScreenHandler);
  registry.register(installDepDefinition, installDepHandler);
  registry.register(focusCheckDefinition, focusCheckHandler);
  registry.register(requestSkillLoadDefinition, requestSkillLoadHandler);
  registry.register(listSkillsDefinition, listSkillsHandler);
  registry.register(writeAutoSkillDefinition, writeAutoSkillHandler);

  if (skillLibrary) {
    setSkillLibrary(skillLibrary);
  }
}
