import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import fc from "fast-check";
import { runMigrations } from "../server/db/schema.ts";
import {
  upsertUsage,
  getProviderLifetimeCost,
  getUsageSummary,
  type UpsertUsageParams,
} from "../server/db/usage.ts";
import { createSpeaker } from "../server/db/speakers.ts";
import { createChat } from "../server/db/chats.ts";

/** Seeded IDs — populated in beforeEach. */
let seededChatId: string;
let seededSpeakerId: string;

/** Seed the FK-referenced tables so usage_logs inserts don't violate constraints. */
function seedDependencies(db: Database): { chatId: string; speakerId: string } {
  const speaker = createSpeaker(db, { name: "Bot", is_user: false });
  const chat = createChat(db, { name: "Test Chat", speaker_ids: [speaker.id] });
  return { chatId: chat.id, speakerId: speaker.id };
}

/** Helper to build a minimal UpsertUsageParams with sane defaults. */
function makeUsageParams(
  overrides: Partial<UpsertUsageParams> = {},
): UpsertUsageParams {
  return {
    date: "2026-02-24",
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4",
    chatId: seededChatId,
    speakerId: seededSpeakerId,
    promptTokens: 100,
    completionTokens: 50,
    costUsd: 0.0045,
    inputPrice: 3.0,
    outputPrice: 15.0,
    ...overrides,
  };
}

describe("usage", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    const seeds = seedDependencies(db);
    seededChatId = seeds.chatId;
    seededSpeakerId = seeds.speakerId;
  });

  // ── upsertUsage ─────────────────────────────────────────────

  test("upsertUsage creates a new row", () => {
    upsertUsage(db, makeUsageParams());

    const rows = getUsageSummary(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.provider).toBe("openrouter");
    expect(rows[0]!.model).toBe("anthropic/claude-sonnet-4");
    expect(rows[0]!.request_count).toBe(1);
    expect(rows[0]!.prompt_tokens).toBe(100);
    expect(rows[0]!.completion_tokens).toBe(50);
    expect(rows[0]!.total_tokens).toBe(150);
    expect(rows[0]!.cost_usd).toBeCloseTo(0.0045, 6);
  });

  test("upsertUsage increments counters on conflict (same aggregate key)", () => {
    const params = makeUsageParams();
    upsertUsage(db, params);
    upsertUsage(db, params);
    upsertUsage(db, params);

    const rows = getUsageSummary(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.request_count).toBe(3);
    expect(rows[0]!.prompt_tokens).toBe(300);
    expect(rows[0]!.completion_tokens).toBe(150);
    expect(rows[0]!.total_tokens).toBe(450);
    expect(rows[0]!.cost_usd).toBeCloseTo(0.0135, 6);
  });

  test("upsertUsage creates separate rows for different aggregate keys", () => {
    upsertUsage(db, makeUsageParams({ provider: "openrouter" }));
    upsertUsage(db, makeUsageParams({ provider: "anthropic" }));
    upsertUsage(db, makeUsageParams({ date: "2026-02-25" }));
    upsertUsage(
      db,
      makeUsageParams({ model: "openai/gpt-4o" }),
    );

    const rows = getUsageSummary(db);
    expect(rows).toHaveLength(4);
  });

  test("upsertUsage handles null chatId and speakerId", () => {
    // Null FKs are valid — usage can be tracked without a specific chat/speaker
    upsertUsage(
      db,
      makeUsageParams({ chatId: null, speakerId: null }),
    );

    const rows = getUsageSummary(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.chat_id).toBeNull();
    expect(rows[0]!.speaker_id).toBeNull();
  });

  // ── BUG: NULL upsert fragmentation ──────────────────────────
  // SQLite treats NULL != NULL in unique indexes. So ON CONFLICT
  // never fires when chat_id or speaker_id is NULL — each insert
  // creates a new row instead of accumulating into one.
  // This test encodes the DESIRED behavior (merge into one row).
  // It will FAIL until the code is fixed.
  test("BUG: upsertUsage with null FKs should still accumulate into one row", () => {
    const params = makeUsageParams({ chatId: null, speakerId: null });

    upsertUsage(db, params);
    upsertUsage(db, params);
    upsertUsage(db, params);

    const rows = getUsageSummary(db);
    // DESIRED: 1 row with request_count=3
    // ACTUAL BUG: 3 rows with request_count=1 each
    expect(rows).toHaveLength(1);
    expect(rows[0]!.request_count).toBe(3);
    expect(rows[0]!.prompt_tokens).toBe(300);
    expect(rows[0]!.completion_tokens).toBe(150);
    expect(rows[0]!.total_tokens).toBe(450);
  });

  test("upsertUsage handles zero tokens", () => {
    upsertUsage(
      db,
      makeUsageParams({
        promptTokens: 0,
        completionTokens: 0,
        costUsd: 0,
      }),
    );

    const rows = getUsageSummary(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.total_tokens).toBe(0);
    expect(rows[0]!.cost_usd).toBe(0);
  });

  test("upsertUsage updates input_price and output_price to latest", () => {
    upsertUsage(db, makeUsageParams({ inputPrice: 3.0, outputPrice: 15.0 }));
    upsertUsage(db, makeUsageParams({ inputPrice: 4.0, outputPrice: 20.0 }));

    const rows = getUsageSummary(db);
    expect(rows).toHaveLength(1);
    // Prices should reflect the latest upsert
    expect(rows[0]!.input_price).toBe(4.0);
    expect(rows[0]!.output_price).toBe(20.0);
  });

  // ── getProviderLifetimeCost ─────────────────────────────────

  test("getProviderLifetimeCost aggregates across dates and models", () => {
    upsertUsage(
      db,
      makeUsageParams({
        date: "2026-02-23",
        model: "model-a",
        promptTokens: 100,
        completionTokens: 50,
        costUsd: 1.0,
      }),
    );
    upsertUsage(
      db,
      makeUsageParams({
        date: "2026-02-24",
        model: "model-b",
        promptTokens: 200,
        completionTokens: 100,
        costUsd: 2.0,
      }),
    );

    const costs = getProviderLifetimeCost(db);
    expect(costs).toHaveLength(1);
    expect(costs[0]!.provider).toBe("openrouter");
    expect(costs[0]!.total_cost).toBeCloseTo(3.0, 6);
    expect(costs[0]!.total_tokens).toBe(450);
    expect(costs[0]!.request_count).toBe(2);
  });

  test("getProviderLifetimeCost groups by provider", () => {
    upsertUsage(db, makeUsageParams({ provider: "openrouter", costUsd: 1.0 }));
    upsertUsage(db, makeUsageParams({ provider: "anthropic", costUsd: 2.0 }));
    upsertUsage(db, makeUsageParams({ provider: "openai", costUsd: 0.5 }));

    const costs = getProviderLifetimeCost(db);
    expect(costs).toHaveLength(3);

    const byProvider = Object.fromEntries(costs.map((c) => [c.provider, c]));
    expect(byProvider.openrouter!.total_cost).toBeCloseTo(1.0, 6);
    expect(byProvider.anthropic!.total_cost).toBeCloseTo(2.0, 6);
    expect(byProvider.openai!.total_cost).toBeCloseTo(0.5, 6);
  });

  test("getProviderLifetimeCost with provider filter", () => {
    upsertUsage(db, makeUsageParams({ provider: "openrouter", costUsd: 1.0 }));
    upsertUsage(db, makeUsageParams({ provider: "anthropic", costUsd: 2.0 }));

    const costs = getProviderLifetimeCost(db, "anthropic");
    expect(costs).toHaveLength(1);
    expect(costs[0]!.provider).toBe("anthropic");
    expect(costs[0]!.total_cost).toBeCloseTo(2.0, 6);
  });

  test("getProviderLifetimeCost returns empty array when no data", () => {
    expect(getProviderLifetimeCost(db)).toEqual([]);
  });

  test("getProviderLifetimeCost returns empty for unknown provider filter", () => {
    upsertUsage(db, makeUsageParams({ provider: "openrouter" }));
    expect(getProviderLifetimeCost(db, "nonexistent")).toEqual([]);
  });

  // ── getUsageSummary ─────────────────────────────────────────

  test("getUsageSummary returns all rows unfiltered", () => {
    upsertUsage(db, makeUsageParams({ date: "2026-02-23" }));
    upsertUsage(db, makeUsageParams({ date: "2026-02-24" }));
    upsertUsage(db, makeUsageParams({ date: "2026-02-25" }));

    const rows = getUsageSummary(db);
    expect(rows).toHaveLength(3);
  });

  test("getUsageSummary filters by provider", () => {
    upsertUsage(db, makeUsageParams({ provider: "openrouter" }));
    upsertUsage(db, makeUsageParams({ provider: "anthropic" }));

    const rows = getUsageSummary(db, { provider: "anthropic" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.provider).toBe("anthropic");
  });

  test("getUsageSummary filters by model", () => {
    upsertUsage(db, makeUsageParams({ model: "model-a" }));
    upsertUsage(db, makeUsageParams({ model: "model-b" }));

    const rows = getUsageSummary(db, { model: "model-a" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.model).toBe("model-a");
  });

  test("getUsageSummary filters by chatId", () => {
    // Use the seeded chat and null to create two distinct aggregate keys
    upsertUsage(db, makeUsageParams({ chatId: seededChatId }));
    upsertUsage(db, makeUsageParams({ chatId: null }));

    const rows = getUsageSummary(db, { chatId: seededChatId });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.chat_id).toBe(seededChatId);
  });

  test("getUsageSummary filters by date range", () => {
    upsertUsage(db, makeUsageParams({ date: "2026-02-20" }));
    upsertUsage(db, makeUsageParams({ date: "2026-02-23" }));
    upsertUsage(db, makeUsageParams({ date: "2026-02-25" }));
    upsertUsage(db, makeUsageParams({ date: "2026-02-28" }));

    const rows = getUsageSummary(db, {
      startDate: "2026-02-22",
      endDate: "2026-02-26",
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.date).sort()).toEqual(["2026-02-23", "2026-02-25"]);
  });

  test("getUsageSummary combined filters", () => {
    upsertUsage(
      db,
      makeUsageParams({
        provider: "openrouter",
        date: "2026-02-24",
        model: "model-a",
      }),
    );
    upsertUsage(
      db,
      makeUsageParams({
        provider: "openrouter",
        date: "2026-02-24",
        model: "model-b",
      }),
    );
    upsertUsage(
      db,
      makeUsageParams({
        provider: "anthropic",
        date: "2026-02-24",
        model: "model-a",
      }),
    );

    const rows = getUsageSummary(db, {
      provider: "openrouter",
      model: "model-a",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.provider).toBe("openrouter");
    expect(rows[0]!.model).toBe("model-a");
  });

  test("getUsageSummary orders by date DESC", () => {
    upsertUsage(db, makeUsageParams({ date: "2026-02-20" }));
    upsertUsage(db, makeUsageParams({ date: "2026-02-25" }));
    upsertUsage(db, makeUsageParams({ date: "2026-02-22" }));

    const rows = getUsageSummary(db);
    expect(rows[0]!.date).toBe("2026-02-25");
    expect(rows[1]!.date).toBe("2026-02-22");
    expect(rows[2]!.date).toBe("2026-02-20");
  });

  test("getUsageSummary returns empty array when no data", () => {
    expect(getUsageSummary(db)).toEqual([]);
  });

  // ── fast-check properties ───────────────────────────────────

  test("property: request_count equals number of upserts for same aggregate key", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (count) => {
          const testDb = new Database(":memory:");
          runMigrations(testDb);
          const seeds = seedDependencies(testDb);

          const params = makeUsageParams();
          // Override with this DB's seeded IDs
          params.chatId = seeds.chatId;
          params.speakerId = seeds.speakerId;
          for (let i = 0; i < count; i++) {
            upsertUsage(testDb, params);
          }

          const rows = getUsageSummary(testDb);
          expect(rows).toHaveLength(1);
          expect(rows[0]!.request_count).toBe(count);
        },
      ),
      { numRuns: 50 },
    );
  });

  test("property: total_tokens always equals prompt_tokens + completion_tokens", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (prompt, completion) => {
          const testDb = new Database(":memory:");
          runMigrations(testDb);

          // Use null FKs to avoid needing seeded entities per iteration
          upsertUsage(testDb, {
            date: "2026-01-01",
            provider: "openrouter",
            model: "test-model",
            chatId: null,
            speakerId: null,
            promptTokens: prompt,
            completionTokens: completion,
            costUsd: 0,
            inputPrice: null,
            outputPrice: null,
          });

          const rows = getUsageSummary(testDb);
          expect(rows[0]!.total_tokens).toBe(prompt + completion);
          expect(rows[0]!.total_tokens).toBe(
            rows[0]!.prompt_tokens + rows[0]!.completion_tokens,
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  test("property: accumulated cost is non-negative for non-negative inputs", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            promptTokens: fc.integer({ min: 0, max: 100_000 }),
            completionTokens: fc.integer({ min: 0, max: 100_000 }),
            costUsd: fc.float({ min: 0, max: 100, noNaN: true }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (upserts) => {
          const testDb = new Database(":memory:");
          runMigrations(testDb);

          for (const u of upserts) {
            upsertUsage(testDb, {
              date: "2026-01-01",
              provider: "openrouter",
              model: "test-model",
              chatId: null,
              speakerId: null,
              promptTokens: u.promptTokens,
              completionTokens: u.completionTokens,
              costUsd: u.costUsd,
              inputPrice: null,
              outputPrice: null,
            });
          }

          const rows = getUsageSummary(testDb);
          expect(rows[0]!.cost_usd).toBeGreaterThanOrEqual(0);
          expect(rows[0]!.prompt_tokens).toBeGreaterThanOrEqual(0);
          expect(rows[0]!.completion_tokens).toBeGreaterThanOrEqual(0);
          expect(rows[0]!.total_tokens).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  test("property: accumulated tokens equal the sum of individual upserts", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            promptTokens: fc.integer({ min: 0, max: 50_000 }),
            completionTokens: fc.integer({ min: 0, max: 50_000 }),
          }),
          { minLength: 1, maxLength: 15 },
        ),
        (upserts) => {
          const testDb = new Database(":memory:");
          runMigrations(testDb);
          const seeds = seedDependencies(testDb);

          let expectedPrompt = 0;
          let expectedCompletion = 0;
          for (const u of upserts) {
            upsertUsage(testDb, {
              date: "2026-01-01",
              provider: "openrouter",
              model: "test-model",
              chatId: seeds.chatId,
              speakerId: seeds.speakerId,
              promptTokens: u.promptTokens,
              completionTokens: u.completionTokens,
              costUsd: 0,
              inputPrice: null,
              outputPrice: null,
            });
            expectedPrompt += u.promptTokens;
            expectedCompletion += u.completionTokens;
          }

          const rows = getUsageSummary(testDb);
          expect(rows).toHaveLength(1);
          expect(rows[0]!.prompt_tokens).toBe(expectedPrompt);
          expect(rows[0]!.completion_tokens).toBe(expectedCompletion);
          expect(rows[0]!.total_tokens).toBe(expectedPrompt + expectedCompletion);
        },
      ),
      { numRuns: 100 },
    );
  });
});
