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
      return new OpenAIModel({
        api: "chat",
        modelId: config.modelId,
        clientConfig: { baseURL: "https://openrouter.ai/api/v1" },
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
