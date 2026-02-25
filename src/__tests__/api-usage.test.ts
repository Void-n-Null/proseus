/**
 * api-usage.test.ts — Tests for src/server/routes/usage.ts
 *
 * Usage tracking API: filtered summaries and provider lifetime costs.
 */

import { test, expect, describe, beforeEach } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { runMigrations } from "../server/db/schema.ts";
import { createUsageRouter } from "../server/routes/usage.ts";
import { upsertUsage } from "../server/db/usage.ts";

function createTestApp(db: Database): Hono {
  const app = new Hono().basePath("/api");
  app.route("/usage", createUsageRouter(db));
  return app;
}

function seedUsage(db: Database) {
  // Seed some usage data across providers, models, and dates
  upsertUsage(db, {
    date: "2025-02-20",
    provider: "anthropic",
    model: "claude-sonnet-4",
    chatId: null,
    speakerId: null,
    promptTokens: 1000,
    completionTokens: 500,
    costUsd: 0.0105,
    inputPrice: 3,
    outputPrice: 15,
  });

  upsertUsage(db, {
    date: "2025-02-21",
    provider: "anthropic",
    model: "claude-sonnet-4",
    chatId: null,
    speakerId: null,
    promptTokens: 2000,
    completionTokens: 1000,
    costUsd: 0.021,
    inputPrice: 3,
    outputPrice: 15,
  });

  upsertUsage(db, {
    date: "2025-02-21",
    provider: "openai",
    model: "gpt-4o",
    chatId: null,
    speakerId: null,
    promptTokens: 500,
    completionTokens: 200,
    costUsd: 0.005,
    inputPrice: 5,
    outputPrice: 15,
  });
}

describe("Usage API routes", () => {
  let db: Database;
  let app: Hono;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    app = createTestApp(db);
  });

  // ── GET / — usage summary ──

  test("GET /api/usage — returns empty array when no data", async () => {
    const res = await app.request("/api/usage");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { usage: unknown[] };
    expect(data.usage).toEqual([]);
  });

  test("GET /api/usage — returns all usage records", async () => {
    seedUsage(db);
    const res = await app.request("/api/usage");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { usage: { provider: string }[] };
    expect(data.usage.length).toBe(3);
  });

  test("GET /api/usage?provider=anthropic — filters by provider", async () => {
    seedUsage(db);
    const res = await app.request("/api/usage?provider=anthropic");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { usage: { provider: string }[] };
    expect(data.usage.length).toBe(2);
    expect(data.usage.every((u) => u.provider === "anthropic")).toBe(true);
  });

  test("GET /api/usage?model=gpt-4o — filters by model", async () => {
    seedUsage(db);
    const res = await app.request("/api/usage?model=gpt-4o");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { usage: { model: string }[] };
    expect(data.usage.length).toBe(1);
    expect(data.usage[0]!.model).toBe("gpt-4o");
  });

  test("GET /api/usage?start_date=2025-02-21 — filters by start date", async () => {
    seedUsage(db);
    const res = await app.request("/api/usage?start_date=2025-02-21");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { usage: { date: string }[] };
    expect(data.usage.length).toBe(2); // both 2025-02-21 records
  });

  test("GET /api/usage?end_date=2025-02-20 — filters by end date", async () => {
    seedUsage(db);
    const res = await app.request("/api/usage?end_date=2025-02-20");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { usage: { date: string }[] };
    expect(data.usage.length).toBe(1); // only 2025-02-20
  });

  test("GET /api/usage with combined filters", async () => {
    seedUsage(db);
    const res = await app.request("/api/usage?provider=anthropic&start_date=2025-02-21");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { usage: unknown[] };
    expect(data.usage.length).toBe(1); // anthropic on 2025-02-21 only
  });

  // ── GET /providers — lifetime costs ──

  test("GET /api/usage/providers — returns empty when no data", async () => {
    const res = await app.request("/api/usage/providers");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { providers: unknown[] };
    expect(data.providers).toEqual([]);
  });

  test("GET /api/usage/providers — returns aggregated costs per provider", async () => {
    seedUsage(db);
    const res = await app.request("/api/usage/providers");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { providers: { provider: string; total_cost: number }[] };
    expect(data.providers.length).toBe(2); // anthropic + openai

    const anthropic = data.providers.find((p) => p.provider === "anthropic");
    expect(anthropic).toBeDefined();
    expect(anthropic!.total_cost).toBeGreaterThan(0);

    const openai = data.providers.find((p) => p.provider === "openai");
    expect(openai).toBeDefined();
  });

  test("GET /api/usage/providers?provider=openai — filters to single provider", async () => {
    seedUsage(db);
    const res = await app.request("/api/usage/providers?provider=openai");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { providers: { provider: string }[] };
    expect(data.providers.length).toBe(1);
    expect(data.providers[0]!.provider).toBe("openai");
  });
});
