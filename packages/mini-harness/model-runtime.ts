import { Agent } from "@strands-agents/sdk";
import { BedrockModel } from "@strands-agents/sdk/models/bedrock";
import { OpenAIModel } from "@strands-agents/sdk/models/openai";
import { AgentSkills, Skill } from "@strands-agents/sdk/vended-plugins/skills";
import { spawn } from "node:child_process";

export type ModelSkill = { name: string; description: string; body: string };
export type LiveResult = {
  text: string; costUsd: number; model: string; usage: { input_tokens: number; output_tokens: number };
  requestPrompt: string; skillMode: "none" | "prompt" | "agent-skills";
};
const system = "Return only JSON: {\"summary\":\"...\",\"files\":{\"out/path\":\"contents\"}}.";

export async function callLiveModel(prompt: string, skills: ModelSkill[] = []): Promise<LiveResult> {
  const executor = flag("--executor") ?? process.env.MINI_EXECUTOR ?? "claude-cli";
  if (executor === "claude-cli") {
    const requestPrompt = injectSkillText(prompt, skills);
    return { ...await callClaude(requestPrompt), requestPrompt, skillMode: skills.length ? "prompt" : "none" };
  }
  if (executor !== "strands") throw new Error(`Unknown executor ${executor}; use claude-cli or strands`);
  const provider = flag("--provider") ?? process.env.MINI_PROVIDER ?? "bedrock";
  const modelId = flag("--model") ?? process.env.MINI_MODEL ?? defaultModel(provider);
  const plugins = skills.length ? [createSkillsPlugin(skills)] : [];
  const systemPrompt = skills.length ? `${system}\nUse the skills tool to load the available phase skill before answering.` : system;
  const agent = new Agent({ model: createModel(provider, modelId), tools: [], plugins, systemPrompt, printer: false });
  const result = await agent.invoke(prompt, { limits: { turns: skills.length ? 3 : 1 } });
  const text = result.lastMessage.content.flatMap((block) => "text" in block && typeof block.text === "string" ? [block.text] : []).join("\n");
  const raw = result.metrics?.accumulatedUsage;
  const usage = { input_tokens: raw?.inputTokens ?? 0, output_tokens: raw?.outputTokens ?? 0 };
  return { text, usage, model: `${provider}:${modelId}`, costUsd: estimate(usage), requestPrompt: prompt, skillMode: skills.length ? "agent-skills" : "none" };
}

export function createSkillsPlugin(skills: ModelSkill[]): AgentSkills {
  return new AgentSkills({
    skills: skills.map((skill) => new Skill({ name: skill.name, description: skill.description, instructions: skill.body })),
    strict: true,
  });
}

function createModel(provider: string, modelId: string) {
  if (provider === "bedrock") return new BedrockModel({ modelId, region: flag("--region") ?? process.env.AWS_REGION ?? "us-west-2", maxTokens: 4096 });
  if (provider === "openrouter") {
    if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set");
    process.env.OPENAI_API_KEY = process.env.OPENROUTER_API_KEY;
    return new OpenAIModel({ modelId, maxTokens: 4096, clientConfig: { baseURL: "https://openrouter.ai/api/v1" } });
  }
  if (provider === "openai") return new OpenAIModel({ modelId, maxTokens: 4096 });
  throw new Error(`Unknown Strands provider ${provider}`);
}

function callClaude(prompt: string): Promise<Omit<LiveResult, "requestPrompt" | "skillMode">> {
  const command = process.env.CLAUDE_PATH ?? "claude";
  const model = flag("--model") ?? process.env.CLAUDE_MODEL ?? "sonnet";
  return new Promise((resolve, reject) => {
    const child = spawn(command, ["-p", "-", "--output-format", "stream-json", "--verbose", "--model", model], { shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let buffer = "", stderr = "", text = "", costUsd = 0, usage = { input_tokens: 0, output_tokens: 0 };
    child.stdout.on("data", (chunk) => { buffer += chunk.toString(); const lines = buffer.split("\n"); buffer = lines.pop() ?? ""; lines.forEach(consume); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.stdin.end(`${system}\n\n${prompt}`);
    child.on("error", reject);
    child.on("close", (code) => { consume(buffer); code === 0 ? resolve({ text, costUsd, usage, model: `claude-cli:${model}` }) : reject(new Error(`Claude Code exited ${code}: ${stderr.slice(0, 300)}`)); });
    function consume(line: string) { try { const event = JSON.parse(line); if (event.type === "result") { text = event.result ?? ""; costUsd = event.total_cost_usd ?? 0; usage = { input_tokens: event.usage?.input_tokens ?? 0, output_tokens: event.usage?.output_tokens ?? 0 }; } } catch {} }
  });
}

export function injectSkillText(prompt: string, skills: ModelSkill[]): string {
  if (!skills.length) return prompt;
  const instructions = skills.map((skill) => `## ${skill.name}\n${skill.body}`).join("\n\n");
  return `${prompt}\n\nSkills:\n${instructions}`;
}

function defaultModel(provider: string): string {
  if (provider === "bedrock") return "anthropic.claude-3-5-sonnet-20241022-v2:0";
  if (provider === "openai") return "gpt-4.1";
  if (provider === "openrouter") return "anthropic/claude-sonnet-4";
  return "gpt-4.1";
}
function estimate(usage: LiveResult["usage"]): number { return (usage.input_tokens * 3 + usage.output_tokens * 15) / 1_000_000; }
function flag(name: string): string | undefined { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
