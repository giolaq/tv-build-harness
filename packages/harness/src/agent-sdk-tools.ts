import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { SkillLibrary } from "./skill-library.js";

export function createAgentSdkToolServer(input: {
  appDir: string;
  workdir: string;
  templateRepo: string;
  templateCommit: string;
  skills: SkillLibrary;
}) {
  const { appDir, workdir, templateRepo, templateCommit, skills } = input;

  const cloneTemplateTool = tool(
    "scaffold",
    "Clone the app template, strip git history, install deps",
    { target_dir: z.string(), app_name: z.string() },
    async ({ target_dir, app_name }) => {
      if (existsSync(join(target_dir, "package.json"))) {
        return { content: [{ type: "text" as const, text: `Template already exists at ${target_dir}` }] };
      }
      execSync(`git clone ${templateRepo} "${target_dir}"`, { stdio: "pipe", timeout: 60_000 });
      execSync(`git checkout --detach ${templateCommit}`, { cwd: target_dir, stdio: "pipe", timeout: 60_000 });
      execSync(`rm -rf "${join(target_dir, ".git")}"`, { stdio: "pipe" });
      execSync(`git init && git add -A && git commit -m "initial template"`, { cwd: target_dir, stdio: "pipe" });
      execSync("yarn install", { cwd: target_dir, stdio: "pipe", timeout: 120_000 });
      return { content: [{ type: "text" as const, text: `Template cloned to ${target_dir}, deps installed. App: ${app_name}` }] };
    }
  );

  const applyThemeTool = tool(
    "apply_theme",
    "Replace theme tokens in packages/shared-ui with brand colors",
    {
      primary_color: z.string(),
      accent_color: z.string(),
      background_color: z.string(),
      font_family: z.string().optional(),
    },
    async ({ primary_color, accent_color, background_color }) => {
      const themeDir = join(appDir, "packages", "shared-ui", "src", "theme");
      if (!existsSync(themeDir)) {
        return { content: [{ type: "text" as const, text: `Theme dir not found at ${themeDir}` }], isError: true };
      }
      return { content: [{ type: "text" as const, text: `Apply these colors to ${themeDir}: primary=${primary_color}, accent=${accent_color}, bg=${background_color}` }] };
    }
  );

  const injectContentTool = tool(
    "inject_content",
    "Write content manifest and generate data hooks",
    { manifest_json: z.string().describe("Stringified JSON of the content manifest") },
    async ({ manifest_json }) => {
      const manifest = JSON.parse(manifest_json);
      const dataDir = join(appDir, "packages", "shared-ui", "src", "data");
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(join(dataDir, "content.json"), JSON.stringify(manifest, null, 2));

      const hookContent = `import contentData from './content.json';\n\nexport type Video = typeof contentData.videos[number];\nexport type Category = typeof contentData.categories[number];\n\nexport function useVideos() { return contentData.videos; }\nexport function useFeatured() { return contentData.videos.filter((v) => contentData.featured.includes(v.id)); }\nexport function useCategories() { return contentData.categories; }\nexport function useVideoById(id: string) { return contentData.videos.find((v) => v.id === id); }\nexport function useVideosByCategory(categoryId: string) {\n  const cat = contentData.categories.find((c) => c.id === categoryId);\n  return cat ? contentData.videos.filter((v) => cat.items.includes(v.id)) : [];\n}\n`;
      writeFileSync(join(dataDir, "useContent.ts"), hookContent);
      if (!existsSync(join(dataDir, "index.ts"))) {
        writeFileSync(join(dataDir, "index.ts"), `export * from './useContent';\n`);
      }
      return { content: [{ type: "text" as const, text: `Injected ${manifest.videos.length} videos, ${manifest.categories.length} categories. Hooks written.` }] };
    }
  );

  const addScreenTool = tool(
    "add_screen",
    "Generate a new screen component with a specific layout",
    { name: z.string(), layout: z.string(), data_source: z.string().optional() },
    async ({ name, layout }) => ({ content: [{ type: "text" as const, text: `Create screen ${name} with layout ${layout} at packages/shared-ui/src/screens/${name}Screen.tsx` }] })
  );

  const removeScreenTool = tool(
    "remove_screen",
    "Remove a screen and its navigation references",
    { name: z.string() },
    async ({ name }) => ({ content: [{ type: "text" as const, text: `Remove screen ${name} from screens/ and navigation config` }] })
  );

  const installDepTool = tool(
    "install_dep",
    "Install a package into a workspace",
    { package_name: z.string(), workspace: z.string(), dev: z.boolean().optional() },
    async ({ package_name, workspace, dev }) => {
      execSync(`yarn workspace ${workspace} add${dev ? " -D" : ""} ${package_name}`, { cwd: appDir, stdio: "pipe", timeout: 120_000 });
      return { content: [{ type: "text" as const, text: `Installed ${package_name} in ${workspace}` }] };
    }
  );

  const focusCheckTool = tool(
    "run_focus_check",
    "Static lint for TV focus/accessibility issues",
    {},
    async () => ({ content: [{ type: "text" as const, text: "Run focus check on the screens directory" }] })
  );

  const gitCommitTool = tool(
    "git_commit",
    "Create a git commit to snapshot progress",
    { message: z.string() },
    async ({ message }) => {
      const status = execSync("git status --porcelain", { cwd: appDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
      if (!status.trim()) return { content: [{ type: "text" as const, text: "No changes to commit" }] };
      execSync("git add -A", { cwd: appDir, stdio: "pipe" });
      execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: appDir, stdio: "pipe" });
      return { content: [{ type: "text" as const, text: `Committed: ${message}` }] };
    }
  );

  const requestSkillLoadTool = tool(
    "request_skill_load",
    "Load a domain skill on-demand",
    { name: z.string() },
    async ({ name }) => {
      const result = skills.loadOnDemand(name);
      if (!result.ok) {
        return { content: [{ type: "text" as const, text: `Skill not found: ${result.error}. Suggestions: ${result.suggested?.join(", ") ?? "none"}` }], isError: true };
      }
      return { content: [{ type: "text" as const, text: result.content! }] };
    }
  );

  const listSkillsTool = tool(
    "list_skills",
    "List available skills",
    { scope: z.enum(["core", "auto", "all"]).optional() },
    async ({ scope }) => {
      const list = skills.listSkills(scope ?? "all");
      const text = list.map(s => `- ${s.name} (applies_to: ${s.applies_to.join(", ")})`).join("\n");
      return { content: [{ type: "text" as const, text: text || "No skills found" }] };
    }
  );

  const writeAutoSkillTool = tool(
    "write_auto_skill",
    "Create a new auto-skill from a solved problem (>=500 chars, needs Gotchas section + code example)",
    { name: z.string(), applies_to: z.array(z.string()), content: z.string() },
    async ({ name, applies_to, content }) => {
      const result = skills.createAutoSkill(name, { applies_to }, content);
      if (!result.ok) {
        return { content: [{ type: "text" as const, text: result.error! }], isError: true };
      }
      return { content: [{ type: "text" as const, text: `Skill "${name}" created.` }] };
    }
  );

  const expoPrebuildTool = tool(
    "expo_prebuild",
    "Run EXPO_TV=1 expo prebuild for a platform",
    { platform: z.enum(["android", "ios"]) },
    async ({ platform }) => {
      try {
        execSync(`EXPO_TV=1 npx expo prebuild --platform ${platform} --no-install`, {
          cwd: join(appDir, "apps", "expo-multi-tv"),
          stdio: "pipe",
          timeout: 600_000,
        });
        return { content: [{ type: "text" as const, text: `Prebuild succeeded for ${platform}` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Prebuild failed: ${msg.slice(0, 300)}` }], isError: true };
      }
    }
  );

  const captureScreenshotTool = tool(
    "capture_screenshot",
    "Capture a screenshot from a running simulator",
    { platform: z.enum(["androidtv", "appletv"]), screen_name: z.string().optional() },
    async ({ platform, screen_name }) => {
      const name = screen_name ?? "home";
      const outPath = join(workdir, "screenshots", `${platform}-${name}.png`);
      try {
        if (platform === "appletv") {
          execSync(`xcrun simctl io booted screenshot "${outPath}"`, { stdio: "pipe", timeout: 10_000 });
        } else {
          execSync(`adb exec-out screencap -p > "${outPath}"`, { stdio: "pipe", timeout: 10_000 });
        }
        return { content: [{ type: "text" as const, text: `Screenshot saved: ${outPath}` }] };
      } catch {
        return { content: [{ type: "text" as const, text: `No ${platform} simulator running` }], isError: true };
      }
    }
  );

  return createSdkMcpServer({
    name: "tv-build",
    version: "0.1.0",
    instructions: "TV app development tools for building multi-platform TV applications from templates.",
    tools: [
      cloneTemplateTool,
      applyThemeTool,
      injectContentTool,
      addScreenTool,
      removeScreenTool,
      installDepTool,
      focusCheckTool,
      gitCommitTool,
      requestSkillLoadTool,
      listSkillsTool,
      writeAutoSkillTool,
      expoPrebuildTool,
      captureScreenshotTool,
    ],
  });
}
