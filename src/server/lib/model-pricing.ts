/**
 * Model Pricing Cache
 *
 * Server-side singleton that fetches and caches model pricing from models.dev.
 * Refreshes every 10 minutes. Falls back gracefully if fetch fails.
 */

import {
  fetchModelCatalog,
  toModelsDevProviderId,
  type ModelsDevResponse,
} from "../../shared/models.ts";
import type { ProviderName } from "../../shared/providers.ts";

// ── Types ──────────────────────────────────────────────────────

export interface ModelPricing {
  inputPrice: number; // USD per million input tokens
  outputPrice: number; // USD per million output tokens
}

// ── Cache state ────────────────────────────────────────────────

let cachedCatalog: ModelsDevResponse | null = null;
let lastFetchAt = 0;
const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Ensure the catalog is loaded and fresh.
 * Non-blocking: if refresh fails, stale cache is used.
 */
async function ensureCatalog(): Promise<ModelsDevResponse | null> {
  const now = Date.now();

  if (cachedCatalog && now - lastFetchAt < REFRESH_INTERVAL_MS) {
    return cachedCatalog;
  }

  try {
    cachedCatalog = await fetchModelCatalog();
    lastFetchAt = now;
  } catch (err) {
    // If we have a stale cache, keep using it
    if (cachedCatalog) {
      console.warn("[model-pricing] Failed to refresh catalog, using stale cache:", err);
    } else {
      console.error("[model-pricing] Failed to fetch catalog and no cache available:", err);
    }
  }

  return cachedCatalog;
}

/**
 * Look up pricing for a specific model.
 *
 * For OpenRouter models the model ID includes the org prefix
 * (e.g. "anthropic/claude-sonnet-4-20250514"), which is used as-is
 * against the OpenRouter provider in the catalog.
 *
 * Returns null if the model or pricing is not found — callers
 * should log with cost_usd = 0 in that case.
 */
export async function getModelPricing(
  provider: ProviderName,
  modelId: string,
): Promise<ModelPricing | null> {
  const catalog = await ensureCatalog();
  if (!catalog) return null;

  const providerKey = toModelsDevProviderId(provider);
  const providerData = catalog[providerKey];
  if (!providerData) return null;

  const model = providerData.models[modelId];
  if (!model?.cost) return null;

  const inputPrice = model.cost.input ?? 0;
  const outputPrice = model.cost.output ?? 0;

  return { inputPrice, outputPrice };
}

/**
 * Compute the USD cost for a request given token counts and pricing.
 *
 * Formula: (promptTokens / 1,000,000 * inputPrice) + (completionTokens / 1,000,000 * outputPrice)
 */
export function computeCost(
  promptTokens: number,
  completionTokens: number,
  pricing: ModelPricing,
): number {
  return (
    (promptTokens / 1_000_000) * pricing.inputPrice +
    (completionTokens / 1_000_000) * pricing.outputPrice
  );
}

/**
 * Sanitize token values from the AI SDK.
 * Some providers return NaN — fall back to 0.
 */
export function sanitizeTokens(value: number | undefined): number {
  if (value === undefined || value === null || Number.isNaN(value)) return 0;
  return Math.max(0, Math.round(value));
}
