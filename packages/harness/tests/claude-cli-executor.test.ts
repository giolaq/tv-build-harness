import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { ClaudeCliError, invokeClaude, type ClaudeSpawn } from "../src/claude-cli.js";
import { ClaudePhaseExecutor } from "../src/claude-phase-executor.js";
import { mergeHarnessConfig } from "../src/harness-config.js";
import { runPipeline } from "../src/pipeline-engine.js";
import { PromptLoader } from "../src/prompt-loader.js";
import { ReplayClient } from "../src/recorder.js";
import { RunLog } from "../src/run-log.js";
import { createRunContext } from "../src/run-context.js";
import { SkillLibrary } from "../src/skill-library.js";
import type { PhaseSpec } from "../src/harness-config.js";
import type { AppSpec, HarnessInput, PhaseResult } from "../src/types.js";

describe("Claude CLI executor subprocess behavior", () => {
  it("delivers the prompt via stdin while using stream-json mode", async () => {
    const fake = createFakeSpawn({
      stdout: [
        { type: "result", subtype: "success", result: "ok", usage: { input_tokens: 3, output_tokens: 4 }, total_cost_usd: 0.01 },
      ],
      code: 0,
    });

    await invokeClaude({
      prompt: "prompt with 'quotes' and $shell characters",
      cwd: "/tmp/app",
      spawnImpl: fake.spawn,
    });

    expect(fake.calls[0].args).toContain("-p");
    expect(fake.calls[0].args).toContain("-");
    expect(fake.calls[0].args).toContain("--output-format");
    expect(fake.calls[0].args).toContain("stream-json");
    expect(fake.stdinWrites).toEqual(["prompt with 'quotes' and $shell characters"]);
  });

  it("parses stream-json result usage and cost", async () => {
    const events: Record<string, unknown>[] = [];
    const fake = createFakeSpawn({
      stdout: [
        { type: "assistant", message: { content: [{ type: "text", text: "working" }] } },
        { type: "result", subtype: "success", result: "final text", usage: { input_tokens: 11, output_tokens: 7 }, total_cost_usd: 0.1234 },
      ],
      code: 0,
    });

    const result = await invokeClaude({
      prompt: "build",
      cwd: "/tmp/app",
      spawnImpl: fake.spawn,
      onEvent: (event) => events.push(event),
    });

    expect(result).toEqual({
      text: "final text",
      tokensUsed: 18,
      costUsd: 0.1234,
      usage: { input_tokens: 11, output_tokens: 7 },
    });
    expect(events.map((event) => event.type)).toEqual(["assistant", "result"]);
  });

  it("surfaces nonzero exits as failed phase results that the pipeline retries", async () => {
    let calls = 0;
    const spec = phase("branding", { retries: 2 });
    const retries: string[] = [];

    const results = await runPipeline({
      phases: [spec],
      maxRetries: 1,
      executor: async (): Promise<PhaseResult> => {
        calls += 1;
        if (calls === 1) {
          const fake = createFakeSpawn({
            stdout: [
              { type: "result", subtype: "success", result: "partial", usage: { input_tokens: 5, output_tokens: 6 }, total_cost_usd: 0.02 },
            ],
            stderr: "bad prompt",
            code: 2,
          });
          try {
            await invokeClaude({ prompt: "try", cwd: "/tmp/app", spawnImpl: fake.spawn });
          } catch (err) {
            expect(err).toBeInstanceOf(ClaudeCliError);
            return { phase: "branding", status: "failed", iterations: 1, error: (err as Error).message };
          }
        }
        return { phase: "branding", status: "success", iterations: 2 };
      },
      hooks: {
        onRetry: (_spec, attempt, max, result) => retries.push(`${attempt}/${max}:${result.status}`),
      },
    });

    expect(calls).toBe(2);
    expect(retries).toEqual(["1/2:failed"]);
    expect(results.get("branding")).toEqual({ phase: "branding", status: "success", iterations: 2 });
  });

  it("records claude-run stream events to recording.json that ReplayClient can load", async () => {
    const workdir = mkdtempSync(join(tmpdir(), "tv-build-claude-recording-"));
    const promptsDir = join(workdir, "prompts");
    const skillsDir = join(workdir, "skills");
    mkdirSync(promptsDir, { recursive: true });
    mkdirSync(join(skillsDir, "meta"), { recursive: true });
    writeFileSync(join(promptsDir, "plan.md"), "{{brief}}");
    writeFileSync(join(skillsDir, "meta", "SKILL.md"), "---\nname: meta\napplies_to: [all]\n---\n\n# Meta");

    const input = harnessInput(workdir, skillsDir);
    const ctx = createRunContext(input);
    const fake = createFakeSpawn({
      stdout: [
        {
          type: "result",
          subtype: "success",
          result: JSON.stringify(appSpec()),
          usage: { input_tokens: 13, output_tokens: 21 },
          total_cost_usd: 0.05,
        },
      ],
      code: 0,
    });
    const executor = new ClaudePhaseExecutor({
      state: ctx.state,
      input,
      events: {},
      harness: ctx.harness,
      log: new RunLog(join(ctx.state.workdir, "run.log")),
      skills: new SkillLibrary(skillsDir),
      prompts: new PromptLoader(promptsDir),
      record: true,
      spawnImpl: fake.spawn,
    });

    const result = await executor.executePhase(phase("plan", { kind: "plan" }));
    const recordingPath = join(ctx.state.workdir, "recording.json");
    const replay = new ReplayClient(recordingPath);

    expect(result.status).toBe("success");
    expect(existsSync(recordingPath)).toBe(true);
    expect(replay.total).toBe(1);
  });

  it("tracks model cost without aborting the phase", async () => {
    const workdir = mkdtempSync(join(tmpdir(), "tv-build-claude-cost-"));
    const promptsDir = join(workdir, "prompts");
    const skillsDir = join(workdir, "skills");
    mkdirSync(promptsDir, { recursive: true });
    mkdirSync(join(skillsDir, "meta"), { recursive: true });
    writeFileSync(join(promptsDir, "plan.md"), "{{brief}}");
    writeFileSync(join(skillsDir, "meta", "SKILL.md"), "---\nname: meta\napplies_to: [all]\n---\n\n# Meta");

    const input = harnessInput(workdir, skillsDir);
    const ctx = createRunContext(input);
    const fake = createFakeSpawn({
      stdout: [
        {
          type: "result",
          subtype: "success",
          result: JSON.stringify(appSpec()),
          usage: { input_tokens: 13, output_tokens: 21 },
          total_cost_usd: 0.05,
        },
      ],
      code: 0,
    });
    const executor = new ClaudePhaseExecutor({
      state: ctx.state,
      input,
      events: {},
      harness: ctx.harness,
      log: new RunLog(join(ctx.state.workdir, "run.log")),
      skills: new SkillLibrary(skillsDir),
      prompts: new PromptLoader(promptsDir),
      record: false,
      spawnImpl: fake.spawn,
    });

    const result = await executor.executePhase(phase("plan", { kind: "plan" }));

    expect(result.status).toBe("success");
    expect(ctx.state.costSoFar).toBe(0.05);
  });
});

function createFakeSpawn(input: {
  stdout: Record<string, unknown>[];
  stderr?: string;
  code: number;
}): {
  spawn: ClaudeSpawn;
  calls: Array<{ command: string; args: string[]; options: unknown }>;
  stdinWrites: string[];
} {
  const calls: Array<{ command: string; args: string[]; options: unknown }> = [];
  const stdinWrites: string[] = [];

  const spawnImpl: ClaudeSpawn = ((command: string, args: string[], options: unknown) => {
    calls.push({ command, args, options });
    const child = new EventEmitter() as any;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();
    child.stdin = new Writable({
      write(chunk, _encoding, callback) {
        stdinWrites.push(chunk.toString());
        callback();
      },
      final(callback) {
        queueMicrotask(() => {
          for (const event of input.stdout) {
            child.stdout.write(`${JSON.stringify(event)}\n`);
          }
          if (input.stderr) child.stderr.write(input.stderr);
          child.emit("close", input.code);
        });
        callback();
      },
    });
    return child;
  }) as ClaudeSpawn;

  return { spawn: spawnImpl, calls, stdinWrites };
}

function phase(name: string, override: Partial<PhaseSpec> = {}): PhaseSpec {
  return {
    name,
    kind: "agent",
    prompt: name,
    skills: [],
    deps: [],
    timeoutMs: 600_000,
    buildPhase: false,
    internalLoop: false,
    abortOnFailure: false,
    cwd: "app",
    verify: [],
    ...override,
  };
}

function harnessInput(workdir: string, skillsDir: string): HarnessInput {
  return {
    prompt: "Build a test app",
    content: {
      title: "Test TV",
      description: "Catalog",
      categories: [{ id: "featured", name: "Featured", items: ["v1"] }],
      videos: [{
        id: "v1",
        title: "Video",
        description: "A video",
        duration_sec: 60,
        thumbnail_url: "https://example.com/thumb.jpg",
        stream_url: "https://example.com/stream.m3u8",
        stream_type: "hls",
        tags: ["test"],
      }],
      featured: ["v1"],
    },
    brand: {
      name: "Test TV",
      primary_color: "#111111",
      accent_color: "#222222",
      background_color: "#000000",
      font_family: "Inter",
      logo_path: "",
      splash_path: "",
    },
    config: {
      platforms: ["web"],
      max_iterations: 90,
      max_retries_per_phase: 2,
      build_locally: true,
      eas_profile: "preview",
      visual_qa_max_iterations: 1,
      visual_qa_pass_threshold: "normal",
      use_devtools: false,
    },
    design: {
      template: "classic",
      hero_height: 500,
      show_hero: true,
      tile_size: "medium",
      tile_ratio: "16:9",
      spacing: "normal",
      corner_radius: 8,
      rails_per_screen: 4,
      font_scale: 1,
      show_descriptions: true,
      show_duration: true,
      navigation_style: "drawer",
      focus_style: "border+scale",
      animation_speed: "normal",
      surface_style: "gradient",
      card_style: "rounded",
    },
    workdir,
    skillsDir,
    harness: mergeHarnessConfig({
      template: {
        repo: "https://example.com/template.git",
        commit: "0123456789abcdef0123456789abcdef01234567",
      },
      models: { plan: "claude-plan-test", execution: "claude-exec-test" },
      tokenBudget: 1000,
    }),
  };
}

function appSpec(): AppSpec {
  return {
    app_name: "Test TV",
    theme: { mode: "dark", tokens: {} },
    navigation: { type: "drawer", routes: [{ id: "home", label: "Home", icon: "home" }] },
    screens: [{ id: "home", route: "home", layout: "hero+rails", sections: [] }],
    components_to_customize: [],
    components_to_add: [],
    data_bindings: [],
    player: { lib: "react-native-video" },
  };
}
