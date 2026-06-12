import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type {
  AppSpec,
  BrandKit,
  ContentManifest,
  DesignTokens,
  Phase,
  PhaseResult,
  RunConfig,
  ScreenTree,
  SessionState,
} from "./types.js";
import { AppSpecSchema } from "./types.js";
import { SkillLibrary } from "./skill-library.js";
import { RunLog } from "./run-log.js";
import { generateScreenshotReport } from "./screenshot-report.js";
import { DEFAULT_HARNESS_CONFIG } from "./harness-config.js";
import type { HarnessConfig, PhaseSpec } from "./harness-config.js";
import { runPipeline, selectActivePhases } from "./pipeline-engine.js";

interface HarnessInput {
  prompt: string;
  content: ContentManifest;
  brand: BrandKit;
  config: RunConfig;
  design: DesignTokens;
  screenTree?: ScreenTree;
  workdir: string;
  skillsDir: string;
  harness?: HarnessConfig;
}

export interface RunOptions {
  generateOnly?: boolean;
}

export class TVAppHarness {
  private state: SessionState;
  private skills: SkillLibrary;
  private log: RunLog;
  private input: HarnessInput;
  private harness: HarnessConfig;
  private phaseCosts: Map<Phase, number> = new Map();

  constructor(input: HarnessInput) {
    this.skills = new SkillLibrary(input.skillsDir);
    this.input = input;
    this.harness = input.harness ?? DEFAULT_HARNESS_CONFIG;

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
      tokenBudget: this.harness.tokenBudget,
      tokensUsed: 0,
      messages: [],
    };
  }

  async run(options: RunOptions = {}): Promise<{ state: SessionState; outDir: string }> {
    const { active } = selectActivePhases(this.harness.phases, {
      platforms: this.state.config.platforms,
      generateOnly: options.generateOnly,
    });

    const results = await runPipeline({
      phases: active,
      // The SDK's inner tool loop handles its own iteration; no outer retry.
      maxRetries: 1,
      executor: (spec) => this.executePhase(spec),
      hooks: {
        onPhaseStart: (spec) => {
          this.state.currentPhase = spec.name;
          this.log.phaseStart(spec.name, this.state.totalIterations);
          console.log(`\n  [${"=".repeat(40)}]`);
          console.log(`  Phase: ${spec.name}`);
          console.log(`  [${"=".repeat(40)}]\n`);
        },
        onPhaseEnd: (spec, result) => {
          this.state.phaseResults.set(spec.name, result);
          this.log.phaseEnd(spec.name, this.state.totalIterations, result.status);
          if (result.status === "failed") {
            console.log(`  Phase ${spec.name} FAILED: ${result.error}`);
          } else {
            console.log(`  Phase ${spec.name}: ${result.status}`);
            if (this.phaseCosts.has(spec.name)) {
              console.log(`  Cost: $${this.phaseCosts.get(spec.name)!.toFixed(4)}`);
            }
          }
        },
        onLog: (msg) => console.log(`  ${msg}`),
        shouldStop: () =>
          this.state.tokensUsed >= this.state.tokenBudget
            ? `Token budget exhausted (${this.state.tokensUsed}/${this.state.tokenBudget})`
            : null,
      },
    });

    for (const [name, result] of results) {
      this.state.phaseResults.set(name, result);
    }

    this.writeReport();
    return { state: this.state, outDir: this.state.workdir };
  }

  private async executePhase(spec: PhaseSpec): Promise<PhaseResult> {
    this.state.totalIterations++;
    const phase = spec.name;

    if (spec.kind === "plan") {
      return this.executePlanPhase();
    }

    if (phase === "scaffold") {
      return this.executeClonePhase();
    }

    const appDir = join(this.state.workdir, "app");
    mkdirSync(appDir, { recursive: true });

    const systemPrompt = this.buildSystemPrompt(spec);
    const userMessage = this.buildPhaseUserMessage(phase);

    const mcpServer = this.createToolServer(appDir);

    // Log prompts to file for debugging
    const promptLogPath = join(this.state.workdir, `prompt-${phase}.md`);
    writeFileSync(promptLogPath, `# Phase: ${phase}\n\n## System Prompt\n\n${systemPrompt}\n\n## User Message\n\n${userMessage}\n`);

    try {
      const q = query({
        prompt: userMessage,
        options: {
          model: spec.model ?? this.harness.models.execution,
          maxTurns: this.getMaxTurns(phase),
          systemPrompt: systemPrompt,
          cwd: appDir,
          mcpServers: { "tv-harness": mcpServer },
          allowedTools: [
            "mcp__tv-harness__scaffold",
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
          env: {
            ...process.env,
            CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
          },
        },
      });

      const verbose = process.argv.includes("--verbose");
      const transcriptPath = join(this.state.workdir, `transcript-${phase}.jsonl`);

      let turns = 0;
      for await (const message of q) {
        if (verbose || process.argv.includes("--log-all")) {
          appendFileSync(transcriptPath, JSON.stringify({ type: message.type, ...this.summarizeMessage(message) }) + "\n");
        }

        if (message.type === "assistant") {
          turns++;
          const usage = message.message.usage;
          this.state.tokensUsed += usage.input_tokens + usage.output_tokens;

          if (verbose) {
            console.log(`    [turn ${turns}] tokens: in=${usage.input_tokens} out=${usage.output_tokens}`);
          }

          for (const block of message.message.content) {
            if (block.type === "text") {
              if (verbose) {
                console.log(`    [text] ${block.text.slice(0, 150)}`);
              }
              this.log.log({ phase, iteration: turns, event: "model_turn", message: block.text.slice(0, 500) });
            }
            if (block.type === "tool_use") {
              if (verbose) {
                console.log(`    [tool] ${block.name}(${JSON.stringify(block.input).slice(0, 100)})`);
              }
              this.log.toolCall(phase, turns, block.name, block.input);
            }
          }
        }

        if (message.type === "user") {
          if (verbose) {
            const content = (message as unknown as { message?: { content?: unknown[] } }).message?.content;
            if (content) {
              for (const block of content as { type: string; content?: string }[]) {
                if (block.type === "tool_result") {
                  console.log(`    [result] ${(block.content ?? "").toString().slice(0, 100)}`);
                }
              }
            }
          }
        }

        if (message.type === "result") {
          if (message.subtype === "success") {
            this.phaseCosts.set(phase, message.total_cost_usd);
            if (verbose) {
              console.log(`    [done] ${message.num_turns} turns, $${message.total_cost_usd.toFixed(4)}`);
            }
            return { phase, status: "success", iterations: message.num_turns };
          } else {
            const resultMsg = message as unknown as { result?: string; subtype: string; total_cost_usd?: number };
            if (resultMsg.total_cost_usd) {
              this.phaseCosts.set(phase, resultMsg.total_cost_usd);
            }
            if (resultMsg.subtype.includes("max_turns")) {
              return { phase, status: "degraded", iterations: turns, error: "Hit turn limit — partial work done" };
            }
            const errorMsg = resultMsg.result ?? `Phase failed: ${resultMsg.subtype}`;
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

  private buildNavigationPrompt(appDir: string): string {
    const spec = this.state.spec;
    if (!spec) return "No AppSpec. Skip.";

    const navType = spec.navigation.type;
    const navStyle = this.input.design.navigation_style;
    const resolvedType = navStyle === "hidden" ? "hidden" : navType;

    const routesList = spec.navigation.routes.map(r =>
      `- id="${r.id}", label="${r.label}"${r.icon ? `, icon="${r.icon}"` : ""}`
    ).join("\n");

    let typeInstruction = "";
    if (resolvedType === "tabs") {
      typeInstruction = `The template uses a drawer — REPLACE it with a top tab navigator. Install @react-navigation/material-top-tabs if needed (yarn workspace add). Create a tab navigator with tabBarPosition:'top', remove drawer imports and CustomDrawerContent.`;
    } else if (resolvedType === "hidden") {
      typeInstruction = `REMOVE visible navigation. Replace the drawer with a plain Stack navigator. No tabs, no drawer — users navigate by selecting content. Remove hamburger icons and drawer toggles.`;
    } else {
      typeInstruction = `Keep the drawer navigator. Update its items to match the routes below.`;
    }

    return `Update navigation at ${appDir}/packages/shared-ui/src/navigation/.

Navigation type: ${resolvedType}
${typeInstruction}

Routes:
${routesList}

IMPORTANT: Only reference screens that ACTUALLY EXIST. First run: ls packages/shared-ui/src/screens/ to check. Do NOT import non-existent screens. After edits, run: npx tsc --noEmit to confirm it compiles.`;
  }

  private buildDesignContext(): string {
    const d = this.input.design;
    const templateDescriptions: Record<string, string> = {
      "netflix-style": "Large hero banner at top, horizontal content rails below. Immersive, content-forward. Hero auto-advances through featured items.",
      "grid-first": "No hero banner. Full-screen grid of tiles. Content density is the priority. Good for large catalogs.",
      "spotlight": "Single focused item takes 60% of screen. Minimal surrounding UI. One item at a time, cinematic feel.",
      "minimal": "Clean, lots of whitespace. Small tiles, subtle animations. Typography-driven hierarchy.",
      "classic": "Standard TV app layout. Left-side navigation, content area on right. Familiar and predictable.",
    };

    return [
      `Template baseline: "${d.template}" — ${templateDescriptions[d.template] ?? "standard layout"}`,
      ``,
      `Layout tokens:`,
      `- Hero: ${d.show_hero ? `visible, ${d.hero_height}px tall` : "hidden (no hero banner)"}`,
      `- Tiles: ${d.tile_size} size, ${d.tile_ratio} aspect ratio, ${d.corner_radius}px corner radius`,
      `- Spacing: ${d.spacing} (${d.spacing === "compact" ? "8-12px gaps" : d.spacing === "relaxed" ? "24-32px gaps" : "16-20px gaps"})`,
      `- Rails per screen: ${d.rails_per_screen}`,
      `- Font scale: ${d.font_scale}x (${d.font_scale > 1.1 ? "larger than default" : d.font_scale < 0.9 ? "smaller than default" : "standard"})`,
      `- Show descriptions on tiles: ${d.show_descriptions}`,
      `- Show duration badges: ${d.show_duration}`,
      ``,
      `Interaction:`,
      `- Navigation style: ${d.navigation_style}`,
      `- Focus style: ${d.focus_style}`,
      `- Animation speed: ${d.animation_speed}`,
    ].join("\n");
  }

  private summarizeMessage(message: unknown): Record<string, unknown> {
    const msg = message as Record<string, unknown>;
    if (msg.type === "assistant") {
      const assistant = msg as { message?: { content?: unknown[]; usage?: unknown } };
      return {
        content: assistant.message?.content,
        usage: assistant.message?.usage,
      };
    }
    if (msg.type === "result") {
      const result = msg as { subtype?: string; result?: string; num_turns?: number; total_cost_usd?: number; usage?: unknown };
      return {
        subtype: result.subtype,
        result: result.result?.slice(0, 500),
        num_turns: result.num_turns,
        total_cost_usd: result.total_cost_usd,
        usage: result.usage,
      };
    }
    return { raw: JSON.stringify(msg).slice(0, 300) };
  }

  private getMaxTurns(phase: Phase): number {
    const limits: Partial<Record<Phase, number>> = {
      branding: 20,
      content: 25,
      screens: 20,
      navigation: 15,
      verify: 10,
      build_loop: 10,
      visual_smoke_test: 5,
    };
    return limits[phase] ?? 15;
  }

  private executeClonePhase(): PhaseResult {
    const appDir = join(this.state.workdir, "app");

    if (existsSync(join(appDir, "package.json"))) {
      return { phase: "scaffold", status: "success", iterations: 0 };
    }

    try {
      console.log("  Cloning template...");
      const branchFlag = this.harness.template.branch ? ` --branch ${this.harness.template.branch}` : "";
      execSync(
        `git clone --depth 1${branchFlag} ${this.harness.template.repo} "${appDir}"`,
        { stdio: "pipe", timeout: 60_000 }
      );
      execSync(`rm -rf "${join(appDir, ".git")}"`, { stdio: "pipe" });
      execSync("git init && git add -A && git commit -m \"initial template\"", {
        cwd: appDir, stdio: "pipe",
      });
      console.log("  Installing dependencies...");
      execSync("yarn install", { cwd: appDir, stdio: "pipe", timeout: 180_000 });
      console.log("  Template ready.");
      return { phase: "scaffold", status: "success", iterations: 0 };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { phase: "scaffold", status: "failed", iterations: 0, error: message.slice(0, 200) };
    }
  }

  private async executePlanPhase(): Promise<PhaseResult> {
    const systemPrompt = `You are a TV app planner. Given a user brief, content manifest, brand kit, and design tokens, produce an AppSpec JSON object. Output ONLY valid JSON matching the AppSpec schema. Do not include markdown fencing or explanation.`;

    const designContext = this.buildDesignContext();

    const userMessage = `Brief: ${this.input.prompt}\n\nContent manifest: ${JSON.stringify(this.input.content)}\n\nBrand kit: ${JSON.stringify(this.input.brand)}\n\nDesign tokens:\n${designContext}\n\nProduce an AppSpec JSON object matching this schema:
- app_name: string
- theme: { mode: "dark"|"light", tokens: Record<string, string> }
- navigation: { type: "drawer"|"tabs"|"single", routes: [{id, label, icon?}] }
- screens: [{id, route, layout: "hero+rails"|"grid"|"detail"|"player"|"settings"|"search", uses_template_screen?, sections: [{id, kind: "featured_hero"|"rail"|"grid"|"text", data_source, title?}]}]
- components_to_customize: [{component, changes: Record<string,string>}]
- components_to_add: [{name, description, props: Record<string,string>}]
- data_bindings: [{manifest_path, screen_id, section_id}]
- player: { lib: "react-native-video" }
- auth?: { provider: "none"|"oauth", flow?: "device_code" }`;

    // Log plan prompt
    const promptLogPath = join(this.state.workdir, "prompt-plan.md");
    writeFileSync(promptLogPath, `# Phase: plan\n\n## System Prompt\n\n${systemPrompt}\n\n## User Message\n\n${userMessage}\n`);

    try {
      const q = query({
        prompt: userMessage,
        options: {
          model: this.harness.models.plan,
          maxTurns: 1,
          systemPrompt: systemPrompt,
          cwd: this.state.workdir,
          tools: [],
          permissionMode: "bypassPermissions",
          persistSession: false,
          env: {
            ...process.env,
            CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
          },
        },
      });

      const verbose = process.argv.includes("--verbose");
      const transcriptPath = join(this.state.workdir, "transcript-plan.jsonl");

      let resultText = "";
      for await (const message of q) {
        if (verbose || process.argv.includes("--log-all")) {
          appendFileSync(transcriptPath, JSON.stringify({ type: message.type, ...this.summarizeMessage(message) }) + "\n");
        }
        if (message.type === "result" && message.subtype === "success") {
          resultText = message.result;
          this.state.tokensUsed += message.usage.input_tokens + message.usage.output_tokens;
          this.phaseCosts.set("plan", message.total_cost_usd);
          if (verbose) {
            console.log(`    [done] $${message.total_cost_usd.toFixed(4)}, tokens: in=${message.usage.input_tokens} out=${message.usage.output_tokens}`);
          }
        }
      }

      // Log the raw response
      writeFileSync(join(this.state.workdir, "plan-response.txt"), resultText);

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

    const templateRepo = this.harness.template.repo;
    const cloneTemplateTool = tool(
      "scaffold",
      "Clone the app template, strip git history, install deps",
      { target_dir: z.string(), app_name: z.string() },
      async ({ target_dir, app_name }) => {
        if (existsSync(join(target_dir, "package.json"))) {
          return { content: [{ type: "text" as const, text: `Template already exists at ${target_dir}` }] };
        }
        execSync(`git clone --depth 1 ${templateRepo} "${target_dir}"`, { stdio: "pipe", timeout: 60_000 });
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

  private buildSystemPrompt(spec: PhaseSpec): string {
    const metaSkill = this.skills.alwaysLoad();
    const phaseSkills = this.skills.loadSkills(spec.skills);

    const parts = [
      "You are a TV app development agent. You have access to specialized TV app tools and standard file tools (Bash, Read, Write, Edit).",
      "Execute the current phase by using the appropriate tools. Prefer the specialized tools when they fit, but use Bash/Edit for file modifications.",
      "",
      "## App Spec",
      JSON.stringify(this.state.spec, null, 2),
      "",
      "## Design System",
      this.buildDesignContext(),
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
      scaffold: `Clone the react-native-multi-tv-app-sample template into "${appDir}" and install dependencies. App name: "${this.state.spec?.app_name}".`,
      branding: `Apply branding to the app at ${appDir}. Brand: name="${this.input.brand.name}", primary=${this.input.brand.primary_color}, accent=${this.input.brand.accent_color}, bg=${this.input.brand.background_color}, font=${this.input.brand.font_family}. Find and edit the theme token files in packages/shared-ui/. Update app.json with the app name.`,
      content: `Wire this content manifest into the app at ${appDir}.

You MUST do ALL of these steps:
1. Write the content JSON to packages/shared-ui/src/data/content.json
2. Create data hooks in packages/shared-ui/src/data/useContent.ts (useFeatured, useCategories, useVideosByCategory, useVideoById, useVideos)
3. CRITICAL: Find the existing screen files (especially HomeScreen.tsx) and REPLACE their old data imports. The template uses "fetchMoviesData" or "moviesData" — you must replace these with your new useContent hooks. grep for "moviesData|fetchMovies|sampleData|mockData" in the screens directory and update every file that uses old data.
4. Update the screen rendering to use the new data shape (Video type with: id, title, description, thumbnail_url, stream_url, stream_type, duration_sec, tags)

Content manifest:
${JSON.stringify(this.input.content, null, 2)}`,
      screens: `Customize screens at ${appDir}/packages/shared-ui/src/screens/ per the AppSpec. IMPORTANT: Only rename or modify EXISTING screen files. Do NOT import screens that don't exist. First run: ls packages/shared-ui/src/screens/ to see what's available. After edits, run: npx tsc --noEmit to verify no broken imports.`,
      navigation: this.buildNavigationPrompt(appDir),
      verify: `Run type checking at ${appDir}: npx tsc --noEmit. Fix any errors.`,
      build_loop: `Build the app at ${appDir} for platforms: ${this.state.config.platforms.join(", ")}. Use expo prebuild for iOS/Android.`,
      vega_build_loop: `Build the Vega OS variant at ${appDir}/apps/vega.`,
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
