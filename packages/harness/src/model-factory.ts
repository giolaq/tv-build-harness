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
      const model = new OpenAIModel({
        api: "chat",
        modelId: config.modelId,
        clientConfig: {
          baseURL: "https://openrouter.ai/api/v1",
          defaultHeaders: { "HTTP-Referer": "https://tv-harness.dev" },
        },
        temperature: config.temperature,
        maxTokens: config.maxTokens ?? 8192,
      });
      // Workaround: Strands SDK crashes on numeric error codes from OpenRouter
      // (err.code?.toLowerCase is not a function). Patch the stream method to
      // catch and re-throw with a string code.
      const origStream = model.stream.bind(model);
      model.stream = async function* (...args: Parameters<typeof model.stream>) {
        try {
          yield* origStream(...args);
        } catch (err: unknown) {
          if (err instanceof Error && err.message.includes("toLowerCase is not a function")) {
            throw new Error(`OpenRouter API error (model: ${config.modelId}). Check model availability and API key.`);
          }
          throw err;
        }
      } as typeof model.stream;
      return model;
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
