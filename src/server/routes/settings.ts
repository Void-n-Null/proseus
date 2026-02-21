/**
 * Settings API routes.
 *
 * Simple key-value store for user preferences like
 * selected model and provider. Persisted in SQLite.
 */

import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import { getSettings, setSetting, getPromptTemplate, setPromptTemplate } from "../db/settings.ts";
import { mergeWithDefaults } from "../../shared/prompt-template.ts";
import type { PromptTemplate } from "../../shared/prompt-template.ts";

/** Known setting keys for model selection. */
const MODEL_KEYS = ["selected_model", "selected_provider"] as const;

export function createSettingsRouter(db: Database) {
  const router = new Hono();

  /**
   * GET / — Retrieve all model-related settings.
   * Returns only the known keys (not arbitrary settings).
   */
  router.get("/", (c) => {
    const settings = getSettings(db, [...MODEL_KEYS]);
    return c.json({ settings });
  });

  /**
   * PUT / — Bulk-update settings.
   * Accepts a JSON body with { settings: Record<string, string> }.
   * Only known keys are accepted.
   */
  router.put("/", async (c) => {
    const body = await c.req.json<{ settings: Record<string, string> }>();

    if (!body?.settings || typeof body.settings !== "object") {
      return c.json({ error: "Missing settings object" }, 400);
    }

    const allowedKeys = new Set<string>(MODEL_KEYS);
    const updated: Record<string, string> = {};

    for (const [key, value] of Object.entries(body.settings)) {
      if (!allowedKeys.has(key)) continue;
      if (typeof value !== "string") continue;
      setSetting(db, key, value);
      updated[key] = value;
    }

    return c.json({ settings: updated });
  });

  router.get("/prompt-template", (c) => {
    const template = getPromptTemplate(db);
    return c.json({ template });
  });

  router.put("/prompt-template", async (c) => {
    const body = await c.req.json<{ template: PromptTemplate }>();
    if (!body?.template || !Array.isArray(body.template.slots)) {
      return c.json({ error: "Invalid template: expected { template: { slots: [...] } }" }, 400);
    }
    const merged = mergeWithDefaults(body.template);
    setPromptTemplate(db, merged);
    return c.json({ template: merged });
  });

  return router;
}
