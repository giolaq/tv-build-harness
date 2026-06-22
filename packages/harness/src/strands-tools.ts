import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { SkillLibrary } from "./skill-library.js";

export interface StrandsToolsContext {
  appDir: string;
  workdir: string;
  templateRepo: string;
  skills: SkillLibrary;
}

export function createStrandsTools(ctx: StrandsToolsContext) {
  const { appDir, workdir, templateRepo, skills } = ctx;

  const scaffoldTool = tool({
    name: "scaffold",
    description: "Clone the app template, strip git history, install deps",
    inputSchema: z.object({
      target_dir: z.string(),
      app_name: z.string(),
    }),
    callback: async ({ target_dir, app_name }) => {
      if (existsSync(join(target_dir, "package.json"))) {
        return `Template already exists at ${target_dir}`;
      }
      execSync(`git clone --depth 1 ${templateRepo} "${target_dir}"`, { stdio: "pipe", timeout: 60_000 });
      execSync(`rm -rf "${join(target_dir, ".git")}"`, { stdio: "pipe" });
      execSync(`git init && git add -A && git commit -m "initial template"`, { cwd: target_dir, stdio: "pipe" });
      execSync("yarn install", { cwd: target_dir, stdio: "pipe", timeout: 120_000 });
      return `Template cloned to ${target_dir}, deps installed. App: ${app_name}`;
    },
  });

  const applyThemeTool = tool({
    name: "apply_theme",
    description: "Replace theme tokens in packages/shared-ui with brand colors",
    inputSchema: z.object({
      primary_color: z.string(),
      accent_color: z.string(),
      background_color: z.string(),
      font_family: z.string().optional(),
    }),
    callback: async ({ primary_color, accent_color, background_color, font_family }) => {
      const themeDir = join(appDir, "packages", "shared-ui", "src", "theme");
      if (!existsSync(themeDir)) {
        return `Theme dir not found at ${themeDir}`;
      }
      const fontNote = font_family ? `, font=${font_family}` : "";
      return `Apply these colors to ${themeDir}: primary=${primary_color}, accent=${accent_color}, bg=${background_color}${fontNote}`;
    },
  });

  const injectContentTool = tool({
    name: "inject_content",
    description: "Write content manifest and generate data hooks",
    inputSchema: z.object({
      manifest_json: z.string().describe("Stringified JSON of the content manifest"),
    }),
    callback: async ({ manifest_json }) => {
      const manifest = JSON.parse(manifest_json);
      const dataDir = join(appDir, "packages", "shared-ui", "src", "data");
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(join(dataDir, "content.json"), JSON.stringify(manifest, null, 2));

      const hookContent = `import contentData from './content.json';\n\nexport type Video = typeof contentData.videos[number];\nexport type Category = typeof contentData.categories[number];\n\nexport function useVideos() { return contentData.videos; }\nexport function useFeatured() { return contentData.videos.filter((v) => contentData.featured.includes(v.id)); }\nexport function useCategories() { return contentData.categories; }\nexport function useVideoById(id: string) { return contentData.videos.find((v) => v.id === id); }\nexport function useVideosByCategory(categoryId: string) {\n  const cat = contentData.categories.find((c) => c.id === categoryId);\n  return cat ? contentData.videos.filter((v) => cat.items.includes(v.id)) : [];\n}\n`;
      writeFileSync(join(dataDir, "useContent.ts"), hookContent);
      if (!existsSync(join(dataDir, "index.ts"))) {
        writeFileSync(join(dataDir, "index.ts"), `export * from './useContent';\n`);
      }
      return `Injected ${manifest.videos.length} videos, ${manifest.categories.length} categories. Hooks written.`;
    },
  });

  const addScreenTool = tool({
    name: "add_screen",
    description: "Generate a new screen component with a specific layout",
    inputSchema: z.object({
      name: z.string(),
      layout: z.string(),
      data_source: z.string().optional(),
    }),
    callback: async ({ name, layout }) => {
      return `Create screen ${name} with layout ${layout} at packages/shared-ui/src/screens/${name}Screen.tsx`;
    },
  });

  const removeScreenTool = tool({
    name: "remove_screen",
    description: "Remove a screen and its navigation references",
    inputSchema: z.object({
      name: z.string(),
    }),
    callback: async ({ name }) => {
      return `Remove screen ${name} from screens/ and navigation config`;
    },
  });

  const installDepTool = tool({
    name: "install_dep",
    description: "Install a package into a workspace",
    inputSchema: z.object({
      package_name: z.string(),
      workspace: z.string(),
      dev: z.boolean().optional(),
    }),
    callback: async ({ package_name, workspace, dev }) => {
      const devFlag = dev ? " -D" : "";
      execSync(`yarn workspace ${workspace} add${devFlag} ${package_name}`, { cwd: appDir, stdio: "pipe", timeout: 120_000 });
      return `Installed ${package_name} in ${workspace}`;
    },
  });

  const runFocusCheckTool = tool({
    name: "run_focus_check",
    description: "Static lint for TV focus/accessibility issues",
    inputSchema: z.object({}),
    callback: async () => {
      return "Run focus check on the screens directory";
    },
  });

  const gitCommitTool = tool({
    name: "git_commit",
    description: "Create a git commit to snapshot progress",
    inputSchema: z.object({
      message: z.string(),
    }),
    callback: async ({ message }) => {
      const status = execSync("git status --porcelain", { cwd: appDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
      if (!status.trim()) return "No changes to commit";
      execSync("git add -A", { cwd: appDir, stdio: "pipe" });
      execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: appDir, stdio: "pipe" });
      return `Committed: ${message}`;
    },
  });

  const requestSkillLoadTool = tool({
    name: "request_skill_load",
    description: "Load a domain skill on-demand",
    inputSchema: z.object({
      name: z.string(),
    }),
    callback: async ({ name }) => {
      const result = skills.loadOnDemand(name);
      if (!result.ok) {
        return `Skill not found: ${result.error}. Suggestions: ${result.suggested?.join(", ") ?? "none"}`;
      }
      return result.content!;
    },
  });

  const listSkillsTool = tool({
    name: "list_skills",
    description: "List available skills",
    inputSchema: z.object({
      scope: z.enum(["core", "auto", "all"]).optional(),
    }),
    callback: async ({ scope }) => {
      const list = skills.listSkills(scope ?? "all");
      const text = list.map(s => `- ${s.name} (applies_to: ${s.applies_to.join(", ")})`).join("\n");
      return text || "No skills found";
    },
  });

  const writeAutoSkillTool = tool({
    name: "write_auto_skill",
    description: "Create a new auto-skill from a solved problem (needs Gotchas section + code example)",
    inputSchema: z.object({
      name: z.string(),
      applies_to: z.array(z.string()),
      content: z.string(),
    }),
    callback: async ({ name, applies_to, content }) => {
      const result = skills.createAutoSkill(name, { applies_to }, content);
      if (!result.ok) {
        return result.error!;
      }
      return `Skill "${name}" created.`;
    },
  });

  const expoPrebuildTool = tool({
    name: "expo_prebuild",
    description: "Run EXPO_TV=1 expo prebuild for a platform",
    inputSchema: z.object({
      platform: z.enum(["android", "ios"]),
    }),
    callback: async ({ platform }) => {
      try {
        execSync(`EXPO_TV=1 npx expo prebuild --platform ${platform} --no-install`, {
          cwd: join(appDir, "apps", "expo-multi-tv"),
          stdio: "pipe",
          timeout: 600_000,
        });
        return `Prebuild succeeded for ${platform}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Prebuild failed: ${msg.slice(0, 300)}`;
      }
    },
  });

  const captureScreenshotTool = tool({
    name: "capture_screenshot",
    description: "Capture a screenshot from a running simulator",
    inputSchema: z.object({
      platform: z.enum(["androidtv", "appletv"]),
      screen_name: z.string().optional(),
    }),
    callback: async ({ platform, screen_name }) => {
      const name = screen_name ?? "home";
      const outPath = join(workdir, "screenshots", `${platform}-${name}.png`);
      try {
        if (platform === "appletv") {
          execSync(`xcrun simctl io booted screenshot "${outPath}"`, { stdio: "pipe", timeout: 10_000 });
        } else {
          execSync(`adb exec-out screencap -p > "${outPath}"`, { stdio: "pipe", timeout: 10_000 });
        }
        return `Screenshot saved: ${outPath}`;
      } catch {
        return `No ${platform} simulator running`;
      }
    },
  });

  return [
    scaffoldTool,
    applyThemeTool,
    injectContentTool,
    addScreenTool,
    removeScreenTool,
    installDepTool,
    runFocusCheckTool,
    gitCommitTool,
    requestSkillLoadTool,
    listSkillsTool,
    writeAutoSkillTool,
    expoPrebuildTool,
    captureScreenshotTool,
  ];
}
