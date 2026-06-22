import { BedrockModel } from "@strands-agents/sdk/models/bedrock";
import { AnthropicModel } from "@strands-agents/sdk/models/anthropic";
import { OpenAIModel } from "@strands-agents/sdk/models/openai";
import type { Model } from "@strands-agents/sdk";
import type { ModelProviderConfig } from "./harness-config.js";

export type { ModelProviderConfig };

export function createModel(config: ModelProviderConfig): Model {
  switch (config.provider) {
    case "bedrock":
      return new BedrockModel({
        modelId: config.modelId,
        region: config.region ?? "us-west-2",
        temperature: config.temperature,
        maxTokens: config.maxTokens ?? 8192,
      });
    case "anthropic":
      return new AnthropicModel({
        modelId: config.modelId,
        temperature: config.temperature,
        maxTokens: config.maxTokens ?? 8192,
      });
    case "openrouter": {
      const key = process.env.OPENROUTER_API_KEY;
      if (!key) throw new Error("OPENROUTER_API_KEY is not set");
      process.env.OPENAI_API_KEY = key;
      // Workaround for Strands SDK bug: it calls err.code?.toLowerCase() but
      // OpenRouter returns numeric codes. Patch fetch to stringify error codes.
      const patchedFetch: typeof fetch = async (input, init) => {
        const res = await fetch(input, init);
        if (!res.ok) {
          const body = await res.text();
          let patched = body;
          try {
            const json = JSON.parse(body);
            if (json.error && typeof json.error.code === "number") {
              json.error.code = String(json.error.code);
              patched = JSON.stringify(json);
            }
          } catch { /* not JSON, pass through */ }
          return new Response(patched, { status: res.status, statusText: res.statusText, headers: res.headers });
        }
        return res;
      };
      return new OpenAIModel({
        api: "chat",
        modelId: config.modelId,
        clientConfig: {
          baseURL: "https://openrouter.ai/api/v1",
          fetch: patchedFetch,
        },
        temperature: config.temperature,
        maxTokens: config.maxTokens ?? 8192,
      });
    }
    case "openai":
      return new OpenAIModel({
        modelId: config.modelId,
        temperature: config.temperature,
        maxTokens: config.maxTokens ?? 8192,
      });
    default:
      throw new Error(`Unknown provider: ${(config as ModelProviderConfig).provider}`);
  }
}
