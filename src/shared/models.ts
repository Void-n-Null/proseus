 /**
 * Model Types & Utilities
 *
 * Unified model catalog sourced from models.dev.
 * Ported from proseus-ai's src/lib/models/.
 */

import type { ProviderName } from "./providers.ts";
export { getCreatorBranding, type Branding as CreatorBranding } from "./brandingData.ts";

// ============================================
// Unified Model Interface
// ============================================

export interface Model {
  /** Model ID used for API calls (e.g. "claude-sonnet-4-20250514") */
  id: string;
  /** Human-readable name (e.g. "Claude Sonnet 4") */
  name: string;
  /** Provider this model belongs to */
  provider: ProviderName;
  /** Context window size (tokens) */
  contextLength?: number;
  /** Max output tokens */
  maxOutputTokens?: number;
  /** Pricing per million input tokens (USD) */
  inputPrice?: number;
  /** Pricing per million output tokens (USD) */
  outputPrice?: number;
  /** Model family grouping (e.g. "claude-sonnet", "gpt") */
  family?: string;
  /** Supports reasoning / chain-of-thought */
  reasoning?: boolean;
  /** Supports tool calling */
  toolCall?: boolean;
  /** Supports temperature control */
  supportsTemperature?: boolean;
  /** Input modalities (e.g. ["text", "image"]) */
  inputModalities?: string[];
  /** Output modalities (e.g. ["text"]) */
  outputModalities?: string[];
  /** Knowledge cutoff date */
  knowledgeCutoff?: string;
  /** First public release date */
  releaseDate?: string;
  /** Whether model weights are publicly available */
  openWeights?: boolean;
  /** Model status: alpha, beta, deprecated */
  status?: "alpha" | "beta" | "deprecated";
}

// ============================================
// models.dev Raw API Types
// ============================================

export interface ModelsDevRawModel {
  id: string;
  name: string;
  family?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  structured_output?: boolean;
  temperature?: boolean;
  knowledge?: string;
  release_date?: string;
  last_updated?: string;
  open_weights?: boolean;
  status?: "alpha" | "beta" | "deprecated";
  cost?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cache_read?: number;
    cache_write?: number;
  };
  limit?: {
    context?: number;
    input?: number;
    output?: number;
  };
  modalities?: {
    input?: string[];
    output?: string[];
  };
}

export interface ModelsDevRawProvider {
  id: string;
  name: string;
  npm?: string;
  env?: string[];
  doc?: string;
  api?: string;
  models: Record<string, ModelsDevRawModel>;
}

export type ModelsDevResponse = Record<string, ModelsDevRawProvider>;

// ============================================
// Provider ID Mapping
// ============================================

/**
 * Map our ProviderName to the models.dev provider key.
 * Most are 1:1 — only 'gemini' differs (models.dev uses 'google').
 */
const MODELS_DEV_PROVIDER_MAP: Record<ProviderName, string> = {
  openrouter: "openrouter",
  anthropic: "anthropic",
  openai: "openai",
  gemini: "google",
  xai: "xai",
};

export function toModelsDevProviderId(provider: ProviderName): string {
  return MODELS_DEV_PROVIDER_MAP[provider];
}

/** Reverse map: models.dev slug → ProviderName (for known providers only). */
const SLUG_TO_PROVIDER: Record<string, ProviderName> = Object.fromEntries(
  Object.entries(MODELS_DEV_PROVIDER_MAP)
    .filter(([k]) => k !== "openrouter")
    .map(([provider, slug]) => [slug, provider as ProviderName]),
);

export interface ModelCreator {
  /** The raw creator slug (e.g. "anthropic", "meta-llama"). */
  slug: string;
  /** Non-null when the creator maps to one of our registered providers. */
  provider: ProviderName | null;
}

/**
 * Resolve the original creator of a model.
 *
 * For OpenRouter models, extracts the org prefix from the model ID
 * (e.g. "anthropic/claude-sonnet-4" → slug "anthropic").
 * For direct-provider models, the creator is the provider itself.
 */
export function getModelCreator(model: Model): ModelCreator {
  if (model.provider === "openrouter") {
    const slashIdx = model.id.indexOf("/");
    const slug = slashIdx > 0 ? model.id.substring(0, slashIdx) : "openrouter";
    return { slug, provider: SLUG_TO_PROVIDER[slug] ?? null };
  }
  const slug = toModelsDevProviderId(model.provider);
  return { slug, provider: model.provider };
}

/** Get the models.dev logo URL for any creator slug. */
export function getCreatorLogoUrl(slug: string): string {
  return `https://models.dev/logos/${slug}.svg`;
}


// ============================================
// Normalizer
// ============================================

export function normalizeModel(
  raw: ModelsDevRawModel,
  provider: ProviderName,
): Model {
  return {
    id: raw.id,
    name: raw.name,
    provider,
    contextLength: raw.limit?.context,
    maxOutputTokens: raw.limit?.output,
    inputPrice: raw.cost?.input,
    outputPrice: raw.cost?.output,
    family: raw.family,
    reasoning: raw.reasoning,
    toolCall: raw.tool_call,
    supportsTemperature: raw.temperature,
    inputModalities: raw.modalities?.input,
    outputModalities: raw.modalities?.output,
    knowledgeCutoff: raw.knowledge,
    releaseDate: raw.release_date,
    openWeights: raw.open_weights,
    status: raw.status,
  };
}

// ============================================
// Catalog Fetcher
// ============================================

export const MODELS_DEV_URL = "https://models.dev/api.json";

export async function fetchModelCatalog(
  signal?: AbortSignal,
): Promise<ModelsDevResponse> {
  const res = await fetch(MODELS_DEV_URL, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch model catalog: ${res.status}`);
  }
  return res.json() as Promise<ModelsDevResponse>;
}

// ============================================
// Provider Model Extraction
// ============================================

export function getModelsForProvider(
  catalog: ModelsDevResponse,
  provider: ProviderName,
): Model[] {
  const modelsDevId = toModelsDevProviderId(provider);
  const rawModels = catalog[modelsDevId]?.models ?? {};

  const models: Model[] = [];
  for (const raw of Object.values(rawModels)) {
    if (raw.status === "deprecated") continue;
    models.push(normalizeModel(raw, provider));
  }

  // Sort by release_date descending (newest first)
  models.sort((a, b) => {
    if (!a.releaseDate && !b.releaseDate) return 0;
    if (!a.releaseDate) return 1;
    if (!b.releaseDate) return -1;
    return b.releaseDate.localeCompare(a.releaseDate);
  });

  return models;
}

// ============================================
// Logo URL
// ============================================

/**
 * Get the models.dev logo URL for a provider.
 * Uses the models.dev provider key (not our ProviderName).
 */
export function getProviderLogoUrl(provider: ProviderName): string {
  const modelsDevId = toModelsDevProviderId(provider);
  return `https://models.dev/logos/${modelsDevId}.svg`;
}

// ============================================
// Search/Ranking
// ============================================

export function rankModelsBySearch(
  models: Model[],
  term: string,
  limit: number = 50,
): Model[] {
  if (!term.trim()) return models.slice(0, limit);

  const normalized = term.toLowerCase().trim();

  const scored = models
    .map((model) => {
      const id = model.id.toLowerCase();
      const name = model.name.toLowerCase();
      const idIndex = id.indexOf(normalized);
      const nameIndex = name.indexOf(normalized);
      const bestIndex =
        idIndex === -1
          ? nameIndex
          : nameIndex === -1
            ? idIndex
            : Math.min(idIndex, nameIndex);

      if (bestIndex === -1) return null;
      return { model, score: bestIndex * 1000 + id.length };
    })
    .filter((item): item is { model: Model; score: number } => item !== null);

  return scored
    .sort((a, b) => a.score - b.score)
    .map((item) => item.model)
    .slice(0, limit);
}

// ============================================
// Sorting & Filtering
// ============================================

export type ModelSortKey =
  | "newest"
  | "price-asc"
  | "price-desc"
  | "context"
  | "name";

export interface ModelFilters {
  reasoning?: boolean;
  toolCall?: boolean;
  vision?: boolean;
  openWeights?: boolean;
  free?: boolean;
}

/** Apply filters to a model list. Only active (truthy) filters are applied. */
export function filterModels(models: Model[], filters: ModelFilters): Model[] {
  return models.filter((m) => {
    if (filters.reasoning && !m.reasoning) return false;
    if (filters.toolCall && !m.toolCall) return false;
    if (filters.vision && !m.inputModalities?.includes("image")) return false;
    if (filters.openWeights && !m.openWeights) return false;
    if (filters.free && (m.inputPrice === undefined || m.inputPrice > 0))
      return false;
    return true;
  });
}

/** Sort a model list by the given key. Returns a new array. */
export function sortModels(models: Model[], sort: ModelSortKey): Model[] {
  const sorted = [...models];
  switch (sort) {
    case "newest":
      sorted.sort((a, b) => {
        if (!a.releaseDate && !b.releaseDate) return 0;
        if (!a.releaseDate) return 1;
        if (!b.releaseDate) return -1;
        return b.releaseDate.localeCompare(a.releaseDate);
      });
      break;
    case "price-asc":
      sorted.sort(
        (a, b) => (a.inputPrice ?? Infinity) - (b.inputPrice ?? Infinity),
      );
      break;
    case "price-desc":
      sorted.sort((a, b) => (b.inputPrice ?? -1) - (a.inputPrice ?? -1));
      break;
    case "context":
      sorted.sort(
        (a, b) => (b.contextLength ?? 0) - (a.contextLength ?? 0),
      );
      break;
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
  }
  return sorted;
}

// ============================================
// Price formatting
// ============================================

export function formatPrice(pricePerMillion: number | undefined): string {
  if (pricePerMillion === undefined) return "?";
  if (pricePerMillion === 0) return "free";
  if (pricePerMillion < 0.01) return "<$0.01";
  return `$${pricePerMillion.toFixed(2)}`;
}

export function formatContext(tokens: number | undefined): string {
  if (!tokens) return "?";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  return `${Math.round(tokens / 1000)}k`;
}
