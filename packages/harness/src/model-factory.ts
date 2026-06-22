import { BedrockModel } from "@strands-agents/sdk/models/bedrock";
import { AnthropicModel } from "@strands-agents/sdk/models/anthropic";
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
    default:
      throw new Error(`Unknown provider: ${(config as ModelProviderConfig).provider}`);
  }
}
