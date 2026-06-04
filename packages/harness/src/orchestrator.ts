import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type {
  AppSpec,
  BrandKit,
  ContentManifest,
  Phase,
  PhaseResult,
  RunConfig,
  SessionState,
} from "./types.js";
import { V1_PHASES, AppSpecSchema } from "./types.js";
import { SkillLibrary } from "./skill-library.js";
import { RunLog } from "./run-log.js";
import { generateScreenshotReport } from "./screenshot-report.js";

interface HarnessInput {
  prompt: string;
  content: ContentManifest;
  brand: BrandKit;
  config: RunConfig;
  workdir: string;
  skillsDir: string;
}

export class TVAppHarness {
  private state: SessionState;
  private skills: SkillLibrary;
  private log: RunLog;
  private input: HarnessInput;
  private phaseCosts: Map<Phase, number> = new Map();

  constructor(input: HarnessInput) {
    this.skills = new SkillLibrary(input.skillsDir);
    this.input = input;

    const runId = randomUUID().slice(0, 8);
    const outDir = join(input.workdir, "out", runId);
    mkdirSync(outDir, { recursive: true });
    mkdirSync(join(outDir, "screenshots"), { recursive: true });

    this.log = new RunLog(join(outDir, "run.log"));

    this.state = {
      runId,
      workdir: outDir,
      config: input.config,
      spec: null,
      currentPhase: "plan",
      phaseResults: new Map(),
      iteration: 0,
      totalIterations: 0,
      tokenBudget: 500_000,
      tokensUsed: 0,
      messages: [],
    };
  }

  async run(): Promise<{ state: SessionState; outDir: string }> {
    const phases = this.getActivePhases();

    for (const phase of phases) {
      this.state.currentPhase = phase;
      this.log.phaseStart(phase, this.state.totalIterations);

      console.log(`\n  [${"=".repeat(40)}]`);
      console.log(`  Phase: ${phase}`);
      console.log(`  [${"=".repeat(40)}]\n`);

      const result = await this.executePhase(phase);
      this.state.phaseResults.set(phase, result);

      this.log.phaseEnd(phase, this.state.totalIterations, result.status);

      if (result.status === "failed") {
        console.log(`  Phase ${phase} FAILED: ${result.error}`);
        if (phase === "plan") {
          console.log(`  Aborting: cannot continue without a valid AppSpec.`);
          break;
        }
      } else {
        console.log(`  Phase ${phase}: ${result.status}`);
        if (this.phaseCosts.has(phase)) {
          console.log(`  Cost: $${this.phaseCosts.get(phase)!.toFixed(4)}`);
        }
      }

      if (this.state.tokensUsed >= this.state.tokenBudget) {
        console.error(`  Token budget exhausted (${this.state.tokensUsed}/${this.state.tokenBudget}). Stopping.`);
        break;
      }
    }

    this.writeReport();
    return { state: this.state, outDir: this.state.workdir };
  }

  private getActivePhases(): Phase[] {
    const { platforms } = this.state.config;
    const generateOnly = process.argv.includes("--generate-only");
    const buildPhases: Phase[] = ["simulator_build", "vega_build", "visual_smoke_test"];

    return V1_PHASES.filter((phase) => {
      if (generateOnly && buildPhases.includes(phase)) return false;
      if (phase === "vega_build") return platforms.includes("firetv-vega");
      return true;
    });
  }

  private async executePhase(phase: Phase): Promise<PhaseResult> {
    this.state.totalIterations++;

    if (phase === "plan") {
      return this.executePlanPhase();
    }

    const appDir = join(this.state.workdir, "app");
    mkdirSync(appDir, { recursive: true });

    const systemPrompt = this.buildSystemPrompt(phase);
    const userMessage = this.buildPhaseUserMessage(phase);

    const mcpServer = this.createToolServer(appDir);

    try {
      const q = query({
        prompt: userMessage,
        options: {
          model: "claude-sonnet-4-6-20250514",
          maxTurns: 30,
          systemPrompt: systemPrompt,
          cwd: appDir,
          mcpServers: { "tv-harness": mcpServer },
          allowedTools: [
            "mcp__tv-harness__clone_template",
            "mcp__tv-harness__apply_theme",
            "mcp__tv-harness__inject_content",
            "mcp__tv-harness__add_screen",
            "mcp__tv-harness__remove_screen",
            "mcp__tv-harness__install_dep",
            "mcp__tv-harness__run_focus_check",
            "mcp__tv-harness__git_commit",
            "mcp__tv-harness__request_skill_load",
            "mcp__tv-harness__list_skills",
            "mcp__tv-harness__write_auto_skill",
            "mcp__tv-harness__expo_prebuild",
            "mcp__tv-harness__capture_screenshot",
            "Bash", "Read", "Write", "Edit",
          ],
          permissionMode: "bypassPermissions",
          persistSession: false,
        },
      });

      let turns = 0;
      for await (const message of q) {
        if (message.type === "assistant") {
          turns++;
          const usage = message.message.usage;
          this.state.tokensUsed += usage.input_tokens + usage.output_tokens;

          for (const block of message.message.content) {
            if (block.type === "tool_use") {
              this.log.toolCall(phase, turns, block.name, block.input);
            }
          }
        }

        if (message.type === "result") {
          if (message.subtype === "success") {
            this.phaseCosts.set(phase, message.total_cost_usd);
            return { phase, status: "success", iterations: message.num_turns };
          } else {
            const errorMsg = (message as unknown as { result?: string }).result ?? `Phase failed: ${message.subtype}`;
            return { phase, status: "failed", iterations: turns, error: errorMsg.slice(0, 200) };
          }
        }
      }

      return { phase, status: "success", iterations: turns };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error(phase, this.state.totalIterations, message);
      return { phase, status: "failed", iterations: 1, error: message };
    }
  }

  private async executePlanPhase(): Promise<PhaseResult> {
    const systemPrompt = `You are a TV app planner. Given a user brief, content manifest, and brand kit, produce an AppSpec JSON object. Output ONLY valid JSON matching the AppSpec schema. Do not include markdown fencing or explanation.`;

    const userMessage = `Brief: ${this.input.prompt}\n\nContent manifest: ${JSON.stringify(this.input.content)}\n\nBrand kit: ${JSON.stringify(this.input.brand)}\n\nProduce an AppSpec JSON object matching this schema:
- app_name: string
- theme: { mode: "dark"|"light", tokens: Record<string, string> }
- navigation: { type: "drawer"|"tabs"|"single", routes: [{id, label, icon?}] }
- screens: [{id, route, layout: "hero+rails"|"grid"|"detail"|"player"|"settings"|"search", uses_template_screen?, sections: [{id, kind: "featured_hero"|"rail"|"grid"|"text", data_source, title?}]}]
- components_to_customize: [{component, changes: Record<string,string>}]
- components_to_add: [{name, description, props: Record<string,string>}]
- data_bindings: [{manifest_path, screen_id, section_id}]
- player: { lib: "react-native-video" }
- auth?: { provider: "none"|"oauth", flow?: "device_code" }`;

    try {
      const q = query({
        prompt: userMessage,
        options: {
          model: "claude-opus-4-7-20250501",
          maxTurns: 1,
          systemPrompt: systemPrompt,
          cwd: this.state.workdir,
          tools: [],
          permissionMode: "bypassPermissions",
          persistSession: false,
        },
      });

      let resultText = "";
      for await (const message of q) {
        if (message.type === "result" && message.subtype === "success") {
          resultText = message.result;
          this.state.tokensUsed += message.usage.input_tokens + message.usage.output_tokens;
          this.phaseCosts.set("plan", message.total_cost_usd);
        }
      }

      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { phase: "plan", status: "failed", iterations: 1, error: "No JSON found in planner output" };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const spec = AppSpecSchema.parse(parsed);
      this.state.spec = spec;

      writeFileSync(
        join(this.state.workdir, "spec.json"),
        JSON.stringify(this.state.spec, null, 2)
      );

      return { phase: "plan", status: "success", iterations: 1 };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { phase: "plan", status: "failed", iterations: 1, error: message };
    }
  }

  private createToolServer(appDir: string) {
    const skills = this.skills;

    const cloneTemplateTool = tool(
      "clone_template",
      "Clone the react-native-multi-tv-app-sample template, strip git history, install deps",
      { target_dir: z.string(), app_name: z.string() },
      async ({ target_dir, app_name }) => {
        if (existsSync(join(target_dir, "package.json"))) {
          return { content: [{ type: "text" as const, text: `Template already exists at ${target_dir}` }] };
        }
        execSync(`git clone --depth 1 https://github.com/AmazonAppDev/react-native-multi-tv-app-sample.git "${target_dir}"`, { stdio: "pipe", timeout: 60_000 });
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
      async ({ primary_color, accent_color, background_color, font_family }) => {
        const themeDir = join(appDir, "packages", "shared-ui", "src", "theme");
        if (!existsSync(themeDir)) {
          return { content: [{ type: "text" as const, text: `Theme dir not found at ${themeDir}` }], isError: true };
        }
        // Delegate actual file edits to Claude's native Edit tool via instructions
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
      async ({ name, layout }) => {
        return { content: [{ type: "text" as const, text: `Create screen ${name} with layout ${layout} at packages/shared-ui/src/screens/${name}Screen.tsx` }] };
      }
    );

    const removeScreenTool = tool(
      "remove_screen",
      "Remove a screen and its navigation references",
      { name: z.string() },
      async ({ name }) => {
        return { content: [{ type: "text" as const, text: `Remove screen ${name} from screens/ and navigation config` }] };
      }
    );

    const installDepTool = tool(
      "install_dep",
      "Install a package into a workspace",
      { package_name: z.string(), workspace: z.string(), dev: z.boolean().optional() },
      async ({ package_name, workspace, dev }) => {
        const devFlag = dev ? " -D" : "";
        execSync(`yarn workspace ${workspace} add${devFlag} ${package_name}`, { cwd: appDir, stdio: "pipe", timeout: 120_000 });
        return { content: [{ type: "text" as const, text: `Installed ${package_name} in ${workspace}` }] };
      }
    );

    const focusCheckTool = tool(
      "run_focus_check",
      "Static lint for TV focus/accessibility issues",
      {},
      async () => {
        return { content: [{ type: "text" as const, text: "Run focus check on the screens directory" }] };
      }
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
      "Create a new auto-skill from a solved problem (≥500 chars, needs Gotchas section + code example)",
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
        const outPath = join(this.state.workdir, "screenshots", `${platform}-${name}.png`);
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
      name: "tv-harness",
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

  private buildSystemPrompt(phase: Phase): string {
    const metaSkill = this.skills.alwaysLoad();
    const phaseSkills = this.skills.loadForPhase(phase);

    const parts = [
      "You are a TV app development agent. You have access to specialized TV app tools and standard file tools (Bash, Read, Write, Edit).",
      "Execute the current phase by using the appropriate tools. Prefer the specialized tools when they fit, but use Bash/Edit for file modifications.",
      "",
      "## App Spec",
      JSON.stringify(this.state.spec, null, 2),
      "",
      "## Skills (domain knowledge)",
      metaSkill,
      ...phaseSkills,
    ];

    return parts.join("\n");
  }

  private buildPhaseUserMessage(phase: Phase): string {
    const appDir = join(this.state.workdir, "app");
    const messages: Record<string, string> = {
      clone_template: `Clone the react-native-multi-tv-app-sample template into "${appDir}" and install dependencies. App name: "${this.state.spec?.app_name}".`,
      metadata_branding: `Apply branding to the app at ${appDir}. Brand: name="${this.input.brand.name}", primary=${this.input.brand.primary_color}, accent=${this.input.brand.accent_color}, bg=${this.input.brand.background_color}, font=${this.input.brand.font_family}. Find and edit the theme token files in packages/shared-ui/. Update app.json with the app name.`,
      manifest_wiring: `Wire this content manifest into the app at ${appDir}. Inject it, create hooks, and update screens to use the new data:\n${JSON.stringify(this.input.content, null, 2)}`,
      screen_customization: `Customize screens at ${appDir} per the AppSpec. Reuse existing template screens where possible. Create new ones only when needed.`,
      navigation_update: `Update navigation at ${appDir} to match AppSpec routes: ${JSON.stringify(this.state.spec?.navigation)}`,
      static_checks: `Run type checking at ${appDir}: npx tsc --noEmit. Fix any errors.`,
      simulator_build: `Build the app at ${appDir} for platforms: ${this.state.config.platforms.join(", ")}. Use expo prebuild for iOS/Android.`,
      vega_build: `Build the Vega OS variant at ${appDir}/apps/vega.`,
      visual_smoke_test: `Verify build artifacts exist at ${appDir} and capture screenshots from any running simulators.`,
    };

    return messages[phase] ?? `Execute phase: ${phase}`;
  }

  private writeReport(): void {
    const totalCost = [...this.phaseCosts.values()].reduce((sum, c) => sum + c, 0);

    const lines: string[] = [
      `# Run Report`,
      ``,
      `**Run ID:** ${this.state.runId}`,
      `**Date:** ${new Date().toISOString()}`,
      `**App:** ${this.state.spec?.app_name ?? "Unknown"}`,
      `**Platforms:** ${this.state.config.platforms.join(", ")}`,
      `**Mode:** Agent SDK`,
      ``,
      `## Token Usage`,
      ``,
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Total tokens | ${this.state.tokensUsed.toLocaleString()} |`,
      `| Budget | ${this.state.tokenBudget.toLocaleString()} |`,
      `| Utilization | ${Math.round((this.state.tokensUsed / this.state.tokenBudget) * 100)}% |`,
      `| Total cost | $${totalCost.toFixed(4)} |`,
      ``,
      `## Phase Costs`,
      ``,
      `| Phase | Status | Cost |`,
      `|-------|--------|------|`,
    ];

    for (const [phase, result] of this.state.phaseResults) {
      const icon = result.status === "success" ? "✓" : result.status === "degraded" ? "~" : "✗";
      const cost = this.phaseCosts.get(phase);
      lines.push(`| ${icon} ${phase} | ${result.status} | ${cost ? `$${cost.toFixed(4)}` : "—"} |`);
    }

    lines.push("");
    lines.push("## AppSpec Summary");
    lines.push("");
    if (this.state.spec) {
      lines.push(`- **Navigation:** ${this.state.spec.navigation.type}`);
      lines.push(`- **Screens:** ${this.state.spec.screens.map(s => s.id).join(", ")}`);
      lines.push(`- **Theme mode:** ${this.state.spec.theme.mode}`);
    } else {
      lines.push("*Plan phase failed — no AppSpec generated.*");
    }

    lines.push("");
    lines.push("## Artifacts");
    lines.push("");
    lines.push("- `spec.json` — Planner output");
    lines.push("- `run.log` — NDJSON audit trail");
    lines.push("- `app/` — Generated application source");

    const screenshotReportPath = generateScreenshotReport(
      this.state.workdir,
      this.state.spec?.app_name ?? "TV App"
    );
    if (screenshotReportPath) {
      lines.push("- `screenshots.html` — Visual comparison report");
    }

    lines.push("");
    writeFileSync(join(this.state.workdir, "report.md"), lines.join("\n"));
  }

  getState(): SessionState {
    return this.state;
  }
}
