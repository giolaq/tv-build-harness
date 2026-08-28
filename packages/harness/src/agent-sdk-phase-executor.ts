import { query } from "@anthropic-ai/claude-agent-sdk";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HarnessInput, Phase, PhaseResult, SessionState } from "./types.js";
import { AppSpecSchema } from "./types.js";
import type { HarnessConfig, PhaseSpec } from "./harness-config.js";
import type { RunLog } from "./run-log.js";
import type { SkillLibrary } from "./skill-library.js";
import { buildDesignContext } from "./phase-prompts.js";
import { createAgentSdkToolServer } from "./agent-sdk-tools.js";
import { bookCost, executeClonePhase, writeHarnessReports, writeSpec } from "./run-context.js";
import { buildAgentPhaseUserMessage, buildSdkSystemPrompt } from "./phase-context.js";

export class AgentSdkPhaseExecutor {
  private phaseCosts: Map<Phase, number> = new Map();

  constructor(private ctx: {
    state: SessionState;
    input: HarnessInput;
    harness: HarnessConfig;
    log: RunLog;
    skills: SkillLibrary;
  }) {}

  async executePhase(spec: PhaseSpec): Promise<PhaseResult> {
    this.ctx.state.totalIterations++;
    const phase = spec.name;

    if (spec.kind === "plan") return this.executePlanPhase();
    if (phase === "scaffold") return this.executeClonePhase();

    const appDir = join(this.ctx.state.workdir, "app");
    mkdirSync(appDir, { recursive: true });

    const systemPrompt = buildSdkSystemPrompt({
      spec,
      state: this.ctx.state,
      harnessInput: this.ctx.input,
      skills: this.ctx.skills,
    });
    const userMessage = buildAgentPhaseUserMessage({
      phase,
      state: this.ctx.state,
      harnessInput: this.ctx.input,
      harness: this.ctx.harness,
    });
    const mcpServer = createAgentSdkToolServer({
      appDir,
      workdir: this.ctx.state.workdir,
      templateRepo: this.ctx.harness.template.repo,
      templateCommit: this.ctx.harness.template.commit,
      skills: this.ctx.skills,
    });

    writeFileSync(
      join(this.ctx.state.workdir, `prompt-${phase}.md`),
      `# Phase: ${phase}\n\n## System Prompt\n\n${systemPrompt}\n\n## User Message\n\n${userMessage}\n`
    );

    try {
      const q = query({
        prompt: userMessage,
        options: {
          model: spec.model ?? this.ctx.harness.models.execution,
          maxTurns: this.getMaxTurns(phase),
          systemPrompt,
          cwd: appDir,
          mcpServers: { "tv-build": mcpServer },
          allowedTools: [
            "mcp__tv-build__scaffold",
            "mcp__tv-build__apply_theme",
            "mcp__tv-build__inject_content",
            "mcp__tv-build__add_screen",
            "mcp__tv-build__remove_screen",
            "mcp__tv-build__install_dep",
            "mcp__tv-build__run_focus_check",
            "mcp__tv-build__git_commit",
            "mcp__tv-build__request_skill_load",
            "mcp__tv-build__list_skills",
            "mcp__tv-build__write_auto_skill",
            "mcp__tv-build__expo_prebuild",
            "mcp__tv-build__capture_screenshot",
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
      const transcriptPath = join(this.ctx.state.workdir, `transcript-${phase}.jsonl`);
      let turns = 0;

      for await (const message of q) {
        if (verbose || process.argv.includes("--log-all")) {
          appendFileSync(transcriptPath, JSON.stringify({ type: message.type, ...this.summarizeMessage(message) }) + "\n");
        }

        if (message.type === "assistant") {
          turns++;
          const usage = message.message.usage;
          this.ctx.state.tokensUsed += usage.input_tokens + usage.output_tokens;
          if (verbose) console.log(`    [turn ${turns}] tokens: in=${usage.input_tokens} out=${usage.output_tokens}`);
          this.logAssistantBlocks(phase, turns, message.message.content, verbose);
        }

        if (message.type === "user" && verbose) this.logVerboseToolResults(message);

        if (message.type === "result") {
          if (message.subtype === "success") {
            this.phaseCosts.set(phase, message.total_cost_usd);
            bookCost(this.ctx.state, message.total_cost_usd);
            if (verbose) console.log(`    [done] ${message.num_turns} turns, $${message.total_cost_usd.toFixed(4)}`);
            return { phase, status: "success", iterations: message.num_turns };
          }

          const resultMsg = message as unknown as { result?: string; subtype: string; total_cost_usd?: number };
          if (resultMsg.total_cost_usd) {
            this.phaseCosts.set(phase, resultMsg.total_cost_usd);
            bookCost(this.ctx.state, resultMsg.total_cost_usd);
          }
          if (resultMsg.subtype.includes("max_turns")) {
            return { phase, status: "degraded", iterations: turns, error: "Hit turn limit — partial work done" };
          }
          return {
            phase,
            status: "failed",
            iterations: turns,
            error: (resultMsg.result ?? `Phase failed: ${resultMsg.subtype}`).slice(0, 200),
          };
        }
      }

      return { phase, status: "success", iterations: turns };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.ctx.log.error(phase, this.ctx.state.totalIterations, message);
      return { phase, status: "failed", iterations: 1, error: message };
    }
  }

  getPhaseCost(phase: Phase): number | undefined {
    return this.phaseCosts.get(phase);
  }

  writeReport(): void {
    writeHarnessReports({
      state: this.ctx.state,
      harness: this.ctx.harness,
      brand: this.ctx.input.brand,
      mode: "Agent SDK (Messages API)",
      totalCost: [...this.phaseCosts.values()].reduce((sum, c) => sum + c, 0),
      phaseCosts: this.phaseCosts,
    });
  }

  private executeClonePhase(): PhaseResult {
    return executeClonePhase(this.ctx.state.workdir, this.ctx.harness, (msg) => console.log(`  ${msg}`));
  }

  private async executePlanPhase(): Promise<PhaseResult> {
    const systemPrompt = "You are a TV app planner. Given a user brief, content manifest, brand kit, and design tokens, produce an AppSpec JSON object. Output ONLY valid JSON matching the AppSpec schema. Do not include markdown fencing or explanation.";
    const designContext = buildDesignContext(this.ctx.input.design);
    const userMessage = `Brief: ${this.ctx.input.prompt}\n\nContent manifest: ${JSON.stringify(this.ctx.input.content)}\n\nBrand kit: ${JSON.stringify(this.ctx.input.brand)}\n\nDesign tokens:\n${designContext}\n\nProduce an AppSpec JSON object matching this schema:
- app_name: string
- theme: { mode: "dark"|"light", tokens: Record<string, string> }
- navigation: { type: "drawer"|"tabs"|"single", routes: [{id, label, icon?}] }
- screens: [{id, route, layout: "hero+rails"|"grid"|"detail"|"player"|"settings"|"search", uses_template_screen?, sections: [{id, kind: "featured_hero"|"rail"|"grid"|"text", data_source, title?}]}]
- components_to_customize: [{component, changes: Record<string,string>}]
- components_to_add: [{name, description, props: Record<string,string>}]
- data_bindings: [{manifest_path, screen_id, section_id}]
- player: { lib: "react-native-video" }
- auth?: { provider: "none"|"oauth", flow?: "device_code" }`;

    writeFileSync(join(this.ctx.state.workdir, "prompt-plan.md"), `# Phase: plan\n\n## System Prompt\n\n${systemPrompt}\n\n## User Message\n\n${userMessage}\n`);

    try {
      const q = query({
        prompt: userMessage,
        options: {
          model: this.ctx.harness.models.plan,
          maxTurns: 1,
          systemPrompt,
          cwd: this.ctx.state.workdir,
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
      const transcriptPath = join(this.ctx.state.workdir, "transcript-plan.jsonl");
      let resultText = "";

      for await (const message of q) {
        if (verbose || process.argv.includes("--log-all")) {
          appendFileSync(transcriptPath, JSON.stringify({ type: message.type, ...this.summarizeMessage(message) }) + "\n");
        }
        if (message.type === "result" && message.subtype === "success") {
          resultText = message.result;
          this.ctx.state.tokensUsed += message.usage.input_tokens + message.usage.output_tokens;
          this.phaseCosts.set("plan", message.total_cost_usd);
          bookCost(this.ctx.state, message.total_cost_usd);
          if (verbose) {
            console.log(`    [done] $${message.total_cost_usd.toFixed(4)}, tokens: in=${message.usage.input_tokens} out=${message.usage.output_tokens}`);
          }
        }
      }

      writeFileSync(join(this.ctx.state.workdir, "plan-response.txt"), resultText);
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { phase: "plan", status: "failed", iterations: 1, error: "No JSON found in planner output" };

      this.ctx.state.spec = AppSpecSchema.parse(JSON.parse(jsonMatch[0]));
      this.ctx.state.spec.creative_seed = this.ctx.state.creativeSeed;
      writeSpec(this.ctx.state.workdir, this.ctx.state.spec, this.ctx.state.creativeSeed);
      return { phase: "plan", status: "success", iterations: 1 };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { phase: "plan", status: "failed", iterations: 1, error: message };
    }
  }

  private logAssistantBlocks(phase: Phase, turns: number, blocks: Array<any>, verbose: boolean): void {
    for (const block of blocks) {
      if (block.type === "text") {
        if (verbose) console.log(`    [text] ${block.text.slice(0, 150)}`);
        this.ctx.log.log({ phase, iteration: turns, event: "model_turn", message: block.text.slice(0, 500) });
      }
      if (block.type === "tool_use") {
        if (verbose) console.log(`    [tool] ${block.name}(${JSON.stringify(block.input).slice(0, 100)})`);
        this.ctx.log.toolCall(phase, turns, block.name, block.input);
      }
    }
  }

  private logVerboseToolResults(message: unknown): void {
    const content = (message as { message?: { content?: unknown[] } }).message?.content;
    if (!content) return;
    for (const block of content as { type: string; content?: string }[]) {
      if (block.type === "tool_result") console.log(`    [result] ${(block.content ?? "").toString().slice(0, 100)}`);
    }
  }

  private summarizeMessage(message: unknown): Record<string, unknown> {
    const msg = message as Record<string, unknown>;
    if (msg.type === "assistant") {
      const assistant = msg as { message?: { content?: unknown[]; usage?: unknown } };
      return { content: assistant.message?.content, usage: assistant.message?.usage };
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
}
