/**
 * Usage Logs — DB operations for cost tracking.
 *
 * Uses INSERT ... ON CONFLICT DO UPDATE to merge same-day requests
 * into a single row per (date, provider, model, chat_id, speaker_id).
 */

import type { Database } from "bun:sqlite";
import { generateId } from "../../shared/ids.ts";

// ── Types ──────────────────────────────────────────────────────

export interface UpsertUsageParams {
  date: string; // YYYY-MM-DD
  provider: string;
  model: string;
  chatId: string | null;
  speakerId: string | null;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  inputPrice: number | null;
  outputPrice: number | null;
}

export interface ProviderCostRow {
  provider: string;
  total_cost: number;
  total_tokens: number;
  request_count: number;
}

export interface UsageSummaryRow {
  date: string;
  provider: string;
  model: string;
  chat_id: string | null;
  speaker_id: string | null;
  request_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  input_price: number | null;
  output_price: number | null;
}

// ── Queries ────────────────────────────────────────────────────

/**
 * Upsert a usage record. If a row with the same aggregate key exists,
 * increment counters instead of inserting a new row.
 *
 * Uses SELECT + INSERT/UPDATE in a transaction instead of ON CONFLICT
 * because SQLite treats NULL != NULL in unique indexes — the ON CONFLICT
 * approach silently creates duplicate rows when chat_id or speaker_id
 * is NULL. The `IS` operator handles NULL equality correctly.
 */
export function upsertUsage(db: Database, params: UpsertUsageParams): void {
  const now = Date.now();
  const totalTokens = params.promptTokens + params.completionTokens;

  const upsert = db.transaction(() => {
    const existing = db
      .query(
        `SELECT id FROM usage_logs
         WHERE date = $date AND provider = $provider AND model = $model
           AND chat_id IS $chatId AND speaker_id IS $speakerId`,
      )
      .get({
        $date: params.date,
        $provider: params.provider,
        $model: params.model,
        $chatId: params.chatId,
        $speakerId: params.speakerId,
      }) as { id: string } | null;

    if (existing) {
      db.query(
        `UPDATE usage_logs SET
           request_count     = request_count + 1,
           prompt_tokens     = prompt_tokens + $promptTokens,
           completion_tokens = completion_tokens + $completionTokens,
           total_tokens      = total_tokens + $totalTokens,
           cost_usd          = cost_usd + $costUsd,
           input_price       = $inputPrice,
           output_price      = $outputPrice,
           updated_at        = $now
         WHERE id = $id`,
      ).run({
        $id: existing.id,
        $promptTokens: params.promptTokens,
        $completionTokens: params.completionTokens,
        $totalTokens: totalTokens,
        $costUsd: params.costUsd,
        $inputPrice: params.inputPrice,
        $outputPrice: params.outputPrice,
        $now: now,
      });
    } else {
      db.query(
        `INSERT INTO usage_logs (
           id, date, provider, model, chat_id, speaker_id,
           request_count, prompt_tokens, completion_tokens, total_tokens,
           cost_usd, input_price, output_price,
           created_at, updated_at
         ) VALUES (
           $id, $date, $provider, $model, $chatId, $speakerId,
           1, $promptTokens, $completionTokens, $totalTokens,
           $costUsd, $inputPrice, $outputPrice,
           $now, $now
         )`,
      ).run({
        $id: generateId(),
        $date: params.date,
        $provider: params.provider,
        $model: params.model,
        $chatId: params.chatId,
        $speakerId: params.speakerId,
        $promptTokens: params.promptTokens,
        $completionTokens: params.completionTokens,
        $totalTokens: totalTokens,
        $costUsd: params.costUsd,
        $inputPrice: params.inputPrice,
        $outputPrice: params.outputPrice,
        $now: now,
      });
    }
  });

  upsert();
}

/**
 * Get lifetime cost per provider (for the UI display).
 * Optionally filter to a single provider.
 */
export function getProviderLifetimeCost(
  db: Database,
  provider?: string,
): ProviderCostRow[] {
  if (provider) {
    return db
      .query(
        `SELECT
           provider,
           COALESCE(SUM(cost_usd), 0) AS total_cost,
           COALESCE(SUM(total_tokens), 0) AS total_tokens,
           COALESCE(SUM(request_count), 0) AS request_count
         FROM usage_logs
         WHERE provider = $provider
         GROUP BY provider`,
      )
      .all({ $provider: provider }) as ProviderCostRow[];
  }

  return db
    .query(
      `SELECT
         provider,
         COALESCE(SUM(cost_usd), 0) AS total_cost,
         COALESCE(SUM(total_tokens), 0) AS total_tokens,
         COALESCE(SUM(request_count), 0) AS request_count
       FROM usage_logs
       GROUP BY provider`,
    )
    .all() as ProviderCostRow[];
}

/**
 * Get usage summary with optional filters.
 * All filters are optional — omitted filters mean "all".
 */
export function getUsageSummary(
  db: Database,
  filters?: {
    provider?: string;
    model?: string;
    chatId?: string;
    startDate?: string;
    endDate?: string;
  },
): UsageSummaryRow[] {
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (filters?.provider) {
    conditions.push("provider = $provider");
    params.$provider = filters.provider;
  }
  if (filters?.model) {
    conditions.push("model = $model");
    params.$model = filters.model;
  }
  if (filters?.chatId) {
    conditions.push("chat_id = $chatId");
    params.$chatId = filters.chatId;
  }
  if (filters?.startDate) {
    conditions.push("date >= $startDate");
    params.$startDate = filters.startDate;
  }
  if (filters?.endDate) {
    conditions.push("date <= $endDate");
    params.$endDate = filters.endDate;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return db
    .query(
      `SELECT
         date, provider, model, chat_id, speaker_id,
         request_count, prompt_tokens, completion_tokens,
         total_tokens, cost_usd, input_price, output_price
       FROM usage_logs
       ${where}
       ORDER BY date DESC, provider, model`,
    )
    .all(params) as UsageSummaryRow[];
}
