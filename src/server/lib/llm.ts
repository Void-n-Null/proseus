/**
 * LLM Provider Factory
 *
 * Creates AI SDK model instances from stored API keys.
 * Adapted from proseus-ai's worker/lib/llm/providers.ts,
 * simplified for local Hono server (no Cloudflare, no Durable Objects).
 *
 * Each provider maps to its AI SDK constructor:
 *   - openrouter  → @openrouter/ai-sdk-provider
 *   - anthropic   → @ai-sdk/anthropic
 *   - openai      → @ai-sdk/openai
 *   - gemini      → @ai-sdk/google
 *   - xai         → @ai-sdk/xai
 */

import type { Database } from "bun:sqlite";
import type { LanguageModel } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import type { ProviderName } from "../../shared/providers.ts";
import { getProviderLabel } from "../../shared/providers.ts";
import { getApiKey } from "../db/connections.ts";

/**
 * Create an AI SDK LanguageModel for a given provider + model ID.
 *
 * Reads the API key from SQLite, constructs the provider instance,
 * and returns a model ready for `streamText()` / `generateText()`.
 *
 * @throws If the provider has no stored API key.
 */
export async function createModel(
  db: Database,
  provider: ProviderName,
  modelId: string,
): Promise<LanguageModel> {
  const apiKey = await getApiKey(db, provider);
  if (!apiKey) {
    throw new Error(
      `${getProviderLabel(provider)} not connected. Add your API key in Connections.`,
    );
  }

  switch (provider) {
    case "openrouter": {
      const or = createOpenRouter({
        apiKey,
        headers: {
          "HTTP-Referer": "https://proseus.dev",
          "X-Title": "Proseus",
        },
      });
      return or.chat(modelId);
    }

    case "anthropic": {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(modelId);
    }

    case "openai": {
      const openai = createOpenAI({ apiKey });
      return openai.chat(modelId);
    }

    case "gemini": {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelId);
    }

    case "xai": {
      const xai = createXai({ apiKey });
      return xai(modelId);
    }

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Check if a provider has a configured API key.
 * Convenience wrapper for the stream manager.
 */
export async function hasApiKey(db: Database, provider: ProviderName): Promise<boolean> {
  return (await getApiKey(db, provider)) !== null;
}
