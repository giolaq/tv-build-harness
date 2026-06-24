import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type TechStack = "react-native" | "kmp" | "flutter" | "native-android" | "unknown";

export interface StackVars {
  stack: TechStack;
  typeCheckCommand: string;
  installCommand: string;
  buildCommandAndroid: string;
  buildCommandWeb: string;
  fileExtension: string;
  focusLibrary: string;
}

export function detectStack(appDir: string): TechStack {
  if (existsSync(join(appDir, "settings.gradle.kts"))) {
    try {
      const content = readFileSync(join(appDir, "settings.gradle.kts"), "utf-8");
      if (content.includes("multiplatform") || content.includes("KotlinMultiplatform") || content.includes("kotlin-multiplatform")) {
        return "kmp";
      }
    } catch {}
    return "native-android";
  }

  if (existsSync(join(appDir, "build.gradle.kts")) || existsSync(join(appDir, "build.gradle"))) {
    return "native-android";
  }

  if (existsSync(join(appDir, "package.json"))) {
    try {
      const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf-8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps["react-native"] || deps["react-native-tvos"]) return "react-native";
    } catch {}
  }

  if (existsSync(join(appDir, "pubspec.yaml"))) return "flutter";

  return "unknown";
}

export function getStackVars(stack: TechStack): StackVars {
  switch (stack) {
    case "react-native":
      return {
        stack,
        typeCheckCommand: "npx tsc --noEmit",
        installCommand: "yarn install",
        buildCommandAndroid: "EXPO_TV=1 npx expo prebuild --platform android --no-install",
        buildCommandWeb: "EXPO_TV=1 npx expo start --web --port 19006",
        fileExtension: ".tsx",
        focusLibrary: "react-tv-space-navigation",
      };
    case "kmp":
      return {
        stack,
        typeCheckCommand: "./gradlew compileKotlin",
        installCommand: "./gradlew dependencies",
        buildCommandAndroid: "./gradlew :androidtv-app:assembleDebug",
        buildCommandWeb: "",
        fileExtension: ".kt",
        focusLibrary: "Compose TV Focus (FocusRequester)",
      };
    case "native-android":
      return {
        stack,
        typeCheckCommand: "./gradlew compileDebugKotlin",
        installCommand: "./gradlew dependencies",
        buildCommandAndroid: "./gradlew assembleDebug",
        buildCommandWeb: "",
        fileExtension: ".kt",
        focusLibrary: "Android TV Leanback / Compose TV",
      };
    case "flutter":
      return {
        stack,
        typeCheckCommand: "flutter analyze",
        installCommand: "flutter pub get",
        buildCommandAndroid: "flutter build apk --debug",
        buildCommandWeb: "flutter run -d web-server",
        fileExtension: ".dart",
        focusLibrary: "Flutter TV Focus",
      };
    default:
      return {
        stack,
        typeCheckCommand: "echo 'Unknown stack — skip type check'",
        installCommand: "echo 'Unknown stack — skip install'",
        buildCommandAndroid: "echo 'Unknown stack — skip build'",
        buildCommandWeb: "",
        fileExtension: "",
        focusLibrary: "unknown",
      };
  }
}

export const STACK_SKILLS: Record<TechStack, Partial<Record<string, string[]>>> = {
  "react-native": {
    scaffold: ["rn-template-anatomy"],
    branding: ["rn-template-anatomy", "rn-theming"],
    content: ["rn-template-anatomy", "rn-manifest-wiring"],
    screens: ["rn-template-anatomy", "rn-shared-ui-catalog", "rn-spatial-navigation", "10ft-ui"],
    creative_ui: ["rn-template-anatomy", "rn-shared-ui-catalog", "creative-tv-ui", "10ft-ui"],
    navigation: ["rn-template-anatomy", "rn-spatial-navigation"],
    verify: ["rn-template-anatomy"],
    build_loop: ["rn-template-anatomy"],
    visual_qa_loop: ["10ft-ui", "rn-theming", "rn-spatial-navigation"],
    android_test_loop: ["android-tv-testing", "android-cli-agent"],
  },
  "kmp": {
    scaffold: ["kmp-template-anatomy"],
    branding: ["kmp-template-anatomy", "kmp-theming"],
    content: ["kmp-template-anatomy", "kmp-data-layer"],
    screens: ["kmp-template-anatomy", "kmp-compose-tv", "10ft-ui"],
    creative_ui: ["kmp-template-anatomy", "kmp-compose-tv", "creative-tv-ui", "10ft-ui"],
    navigation: ["kmp-template-anatomy", "kmp-navigation"],
    verify: ["kmp-verify-patterns"],
    build_loop: ["kmp-build-commands"],
    android_test_loop: ["android-tv-testing", "android-cli-agent"],
  },
  "native-android": {
    scaffold: ["kmp-template-anatomy"],
    branding: ["kmp-theming"],
    screens: ["kmp-compose-tv", "10ft-ui"],
    verify: ["kmp-verify-patterns"],
    build_loop: ["kmp-build-commands"],
    android_test_loop: ["android-tv-testing", "android-cli-agent"],
  },
  "flutter": {},
  "unknown": {},
};
