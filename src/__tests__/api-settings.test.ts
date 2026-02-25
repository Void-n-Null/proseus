/**
 * api-settings.test.ts — Tests for src/server/routes/settings.ts
 *
 * Settings API: key-value store for model selection + prompt template CRUD.
 */

import { test, expect, describe, beforeEach } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { runMigrations } from "../server/db/schema.ts";
import { createSettingsRouter } from "../server/routes/settings.ts";

function createTestApp(db: Database): Hono {
  const app = new Hono().basePath("/api");
  app.route("/settings", createSettingsRouter(db));
  return app;
}

function jsonPut(body: unknown): RequestInit {
  return {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  };
}

describe("Settings API routes", () => {
  let db: Database;
  let app: Hono;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    app = createTestApp(db);
  });

  // ── GET / ──

  test("GET /api/settings — returns empty object initially", async () => {
    const res = await app.request("/api/settings");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { settings: Record<string, string> };
    expect(data.settings).toBeDefined();
    expect(typeof data.settings).toBe("object");
  });

  // ── PUT / ──

  test("PUT /api/settings — saves and returns allowed keys", async () => {
    const res = await app.request(
      "/api/settings",
      jsonPut({ settings: { selected_model: "claude-sonnet-4", selected_provider: "anthropic" } }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { settings: Record<string, string> };
    expect(data.settings.selected_model).toBe("claude-sonnet-4");
    expect(data.settings.selected_provider).toBe("anthropic");
  });

  test("PUT /api/settings — ignores unknown keys", async () => {
    const res = await app.request(
      "/api/settings",
      jsonPut({ settings: { selected_model: "gpt-4o", unknown_key: "value" } }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { settings: Record<string, string> };
    expect(data.settings.selected_model).toBe("gpt-4o");
    expect(data.settings).not.toHaveProperty("unknown_key");
  });

  test("PUT /api/settings — partial update preserves existing", async () => {
    await app.request(
      "/api/settings",
      jsonPut({ settings: { selected_model: "gpt-4o", selected_provider: "openai" } }),
    );
    await app.request(
      "/api/settings",
      jsonPut({ settings: { selected_model: "claude-sonnet-4" } }),
    );

    const res = await app.request("/api/settings");
    const data = (await res.json()) as { settings: Record<string, string> };
    expect(data.settings.selected_model).toBe("claude-sonnet-4");
    expect(data.settings.selected_provider).toBe("openai"); // preserved
  });

  test("PUT /api/settings — rejects missing settings object", async () => {
    const res = await app.request("/api/settings", jsonPut({}));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("Missing settings");
  });

  // ── GET /prompt-template ──

  test("GET /api/settings/prompt-template — returns default template", async () => {
    const res = await app.request("/api/settings/prompt-template");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { template: { slots: unknown[] } };
    expect(data.template).toBeDefined();
    // Default has all slots
    expect(data.template.slots).toBeDefined();
  });

  // ── PUT /prompt-template ──

  test("PUT /api/settings/prompt-template — saves and returns merged template", async () => {
    const template = {
      slots: [
        { id: "main", enabled: true, content: "Custom prompt" },
        { id: "history", enabled: true },
      ],
    };

    const res = await app.request(
      "/api/settings/prompt-template",
      jsonPut({ template }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { template: { slots: { id: string; content?: string }[] } };
    expect(data.template.slots).toBeDefined();

    // Should contain all default slot IDs (merged)
    const ids = data.template.slots.map((s) => s.id);
    expect(ids).toContain("main");
    expect(ids).toContain("history");
    expect(ids).toContain("post_history");
    expect(ids).toContain("assistant_prefill");

    // Custom content preserved
    const mainSlot = data.template.slots.find((s) => s.id === "main");
    expect(mainSlot?.content).toBe("Custom prompt");
  });

  test("PUT /api/settings/prompt-template — round-trip preserves data", async () => {
    const template = {
      slots: [
        { id: "main", enabled: false, content: "Round-trip test" },
        { id: "char_description", enabled: true },
        { id: "history", enabled: true },
        { id: "post_history", enabled: true, content: "Post instruction" },
        { id: "assistant_prefill", enabled: true, content: "Sure," },
      ],
    };

    await app.request("/api/settings/prompt-template", jsonPut({ template }));

    const res = await app.request("/api/settings/prompt-template");
    const data = (await res.json()) as { template: { slots: { id: string; enabled: boolean; content?: string }[] } };

    const main = data.template.slots.find((s) => s.id === "main");
    expect(main?.enabled).toBe(false);
    expect(main?.content).toBe("Round-trip test");

    const prefill = data.template.slots.find((s) => s.id === "assistant_prefill");
    expect(prefill?.enabled).toBe(true);
    expect(prefill?.content).toBe("Sure,");
  });

  test("PUT /api/settings/prompt-template — rejects invalid body", async () => {
    const res = await app.request(
      "/api/settings/prompt-template",
      jsonPut({ template: { notSlots: true } }),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("Invalid template");
  });

  test("PUT /api/settings/prompt-template — rejects missing template", async () => {
    const res = await app.request(
      "/api/settings/prompt-template",
      jsonPut({}),
    );
    expect(res.status).toBe(400);
  });
});
