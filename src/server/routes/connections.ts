/**
 * Connections API routes.
 *
 * CRUD for provider API keys. Keys are stored in local SQLite.
 * The list endpoint returns connection status only (never raw keys).
 *
 * On save, the key is validated against the provider's API using a
 * lightweight zero-cost endpoint before being persisted. This catches
 * typos and expired keys immediately rather than failing silently
 * on the first generation.
 */

import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import { isProviderName, type ProviderName } from "../../shared/providers.ts";
import {
  listConnections,
  upsertConnection,
  deleteConnection,
} from "../db/connections.ts";

// ============================================
// API Key Validation
// ============================================

/**
 * Validate an API key against the provider's API.
 * Uses lightweight, zero-token-cost endpoints per provider.
 *
 * Returns null if valid, or an error message string if invalid.
 * Network errors and 5xx responses are treated as "valid" — we don't
 * want to block key storage because a provider is temporarily down.
 */
async function validateApiKey(
  provider: ProviderName,
  apiKey: string,
): Promise<string | null> {
  try {
    let response: Response;

    switch (provider) {
      case "openrouter": {
        // /api/v1/key returns { data: { label, ... } } for valid keys.
        // Invalid keys return 502 with { error: { message, code } } —
        // NOT 401, so we must check the body.
        response = await fetch("https://openrouter.ai/api/v1/key", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        const orBody = (await response.json().catch(() => null)) as {
          data?: { label?: string };
          error?: { message?: string };
        } | null;
        if (orBody?.data?.label) {
          return null; // Valid — has key metadata
        }
        // Any other shape means invalid
        return (
          orBody?.error?.message ??
          "Invalid OpenRouter API key. Get a valid key from https://openrouter.ai/settings/keys."
        );
      }

      case "anthropic":
        // /v1/models returns 401 for invalid keys
        response = await fetch(
          "https://api.anthropic.com/v1/models?limit=1",
          {
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
          },
        );
        break;

      case "openai":
        // /v1/models returns 401 for invalid keys
        response = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        break;

      case "gemini":
        // Gemini uses key-in-query, returns 400/403 for invalid keys
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=1`,
        );
        if (response.status === 400 || response.status === 403) {
          return "Invalid Gemini API key. Check that the key is correct and the Generative Language API is enabled.";
        }
        break;

      case "xai": {
        // /v1/api-key returns key metadata for valid keys.
        // xAI returns 400 (not 401) for invalid keys.
        response = await fetch("https://api.x.ai/v1/api-key", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (response.status === 400) {
          const xaiBody = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          if (xaiBody?.error?.includes("Incorrect API key")) {
            return "Invalid xAI API key. Get a valid key from https://console.x.ai.";
          }
          return "Invalid xAI API key. Check that the key is correct.";
        }
        break;
      }

      default:
        return null; // Unknown provider, skip validation
    }

    if (!response!.ok) {
      const status = response!.status;
      if (status === 401 || status === 403) {
        return `Invalid API key. The ${provider} API rejected this key (${status}).`;
      }
      // 5xx / rate-limit — don't block storage, provider may be temporarily down.
      // But log it so we know.
      console.warn(
        `[validateApiKey] ${provider} returned ${status}, allowing key storage`,
      );
      return null;
    }

    return null; // Valid
  } catch (err) {
    // Network errors — don't block key storage, provider might be temporarily down
    console.warn(
      `[validateApiKey] ${provider} validation failed with error:`,
      err,
    );
    return null;
  }
}

// ============================================
// Routes
// ============================================

export function createConnectionsRouter(db: Database) {
  const router = new Hono();

  /** GET /api/connections — list all connection statuses. */
  router.get("/", (c) => {
    const connections = listConnections(db);
    return c.json({ connections });
  });

  /** PUT /api/connections/:provider — validate and save a connection. */
  router.put("/:provider", async (c) => {
    const provider = c.req.param("provider");
    if (!isProviderName(provider)) {
      return c.json({ error: `Invalid provider: ${provider}` }, 400);
    }

    const body = await c.req.json<{ api_key?: string }>();
    if (
      !body.api_key ||
      typeof body.api_key !== "string" ||
      !body.api_key.trim()
    ) {
      return c.json({ error: "api_key is required" }, 400);
    }

    const apiKey = body.api_key.trim();

    // Basic format check
    if (apiKey.length < 10) {
      return c.json(
        { error: "Invalid API key format. Key must be at least 10 characters." },
        400,
      );
    }

    // Validate against provider API
    const validationError = await validateApiKey(provider, apiKey);
    if (validationError) {
      return c.json({ error: validationError }, 400);
    }

    await upsertConnection(db, provider, apiKey);
    return c.json({ provider, connected: true });
  });

  /** DELETE /api/connections/:provider — remove a connection. */
  router.delete("/:provider", (c) => {
    const provider = c.req.param("provider");
    if (!isProviderName(provider)) {
      return c.json({ error: `Invalid provider: ${provider}` }, 400);
    }

    deleteConnection(db, provider);
    return c.json({ ok: true });
  });

  return router;
}
