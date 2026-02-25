/**
 * models.test.ts — Tests for src/shared/models.ts
 *
 * Model catalog utilities: normalization, provider mapping, search/ranking,
 * filtering, sorting, and formatting. All pure functions. Tests cover:
 *
 *  - normalizeModel: field mapping from raw API to unified Model
 *  - toModelsDevProviderId: provider name → models.dev key
 *  - getModelCreator: OpenRouter org prefix extraction
 *  - getModelsForProvider: catalog extraction with deprecated filtering
 *  - rankModelsBySearch: empty term, match scoring, limit
 *  - filterModels: reasoning, toolCall, vision, openWeights, free
 *  - sortModels: all 5 sort keys
 *  - formatPrice / formatContext: edge cases
 *  - Property-based: sort invariants, filter invariants, search limit
 */

import { test, expect, describe } from "bun:test";
import * as fc from "fast-check";

import {
  normalizeModel,
  toModelsDevProviderId,
  getModelCreator,
  getCreatorLogoUrl,
  getProviderLogoUrl,
  getModelsForProvider,
  rankModelsBySearch,
  filterModels,
  sortModels,
  formatPrice,
  formatContext,
  type Model,
  type ModelsDevRawModel,
  type ModelsDevResponse,
  type ModelSortKey,
  type ModelFilters,
} from "../shared/models.ts";
import { PROVIDER_IDS, type ProviderName } from "../shared/providers.ts";

// ── Test fixtures ────────────────────────────────────────────

const RAW_FULL: ModelsDevRawModel = {
  id: "claude-sonnet-4-20250514",
  name: "Claude Sonnet 4",
  family: "claude-sonnet",
  reasoning: true,
  tool_call: true,
  temperature: true,
  knowledge: "2025-03",
  release_date: "2025-05-14",
  open_weights: false,
  status: undefined,
  cost: { input: 3, output: 15 },
  limit: { context: 200000, output: 8192 },
  modalities: { input: ["text", "image"], output: ["text"] },
};

const RAW_MINIMAL: ModelsDevRawModel = {
  id: "test-model",
  name: "Test Model",
};

function makeModel(overrides: Partial<Model> = {}): Model {
  return {
    id: "test-model",
    name: "Test Model",
    provider: "anthropic",
    ...overrides,
  };
}

const MOCK_CATALOG: ModelsDevResponse = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    models: {
      "claude-sonnet-4-20250514": {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        cost: { input: 3, output: 15 },
        release_date: "2025-05-14",
      },
      "claude-haiku-3.5": {
        id: "claude-haiku-3.5",
        name: "Claude Haiku 3.5",
        cost: { input: 0.8, output: 4 },
        release_date: "2024-10-22",
      },
      "old-deprecated": {
        id: "old-deprecated",
        name: "Old Model",
        status: "deprecated",
        release_date: "2023-01-01",
      },
    },
  },
  google: {
    id: "google",
    name: "Google",
    models: {
      "gemini-2.0-flash": {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        cost: { input: 0.1, output: 0.4 },
      },
    },
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    models: {
      "anthropic/claude-sonnet-4-20250514": {
        id: "anthropic/claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        cost: { input: 3, output: 15 },
      },
      "meta-llama/llama-3.1-405b": {
        id: "meta-llama/llama-3.1-405b",
        name: "Llama 3.1 405B",
        cost: { input: 0, output: 0 },
      },
    },
  },
};

// ============================================================
// normalizeModel
// ============================================================

describe("normalizeModel", () => {
  test("maps all fields from raw model with full data", () => {
    const model = normalizeModel(RAW_FULL, "anthropic");

    expect(model.id).toBe("claude-sonnet-4-20250514");
    expect(model.name).toBe("Claude Sonnet 4");
    expect(model.provider).toBe("anthropic");
    expect(model.contextLength).toBe(200000);
    expect(model.maxOutputTokens).toBe(8192);
    expect(model.inputPrice).toBe(3);
    expect(model.outputPrice).toBe(15);
    expect(model.family).toBe("claude-sonnet");
    expect(model.reasoning).toBe(true);
    expect(model.toolCall).toBe(true);
    expect(model.supportsTemperature).toBe(true);
    expect(model.inputModalities).toEqual(["text", "image"]);
    expect(model.outputModalities).toEqual(["text"]);
    expect(model.knowledgeCutoff).toBe("2025-03");
    expect(model.releaseDate).toBe("2025-05-14");
    expect(model.openWeights).toBe(false);
    expect(model.status).toBeUndefined();
  });

  test("handles minimal raw model (only id and name)", () => {
    const model = normalizeModel(RAW_MINIMAL, "openai");

    expect(model.id).toBe("test-model");
    expect(model.name).toBe("Test Model");
    expect(model.provider).toBe("openai");
    expect(model.contextLength).toBeUndefined();
    expect(model.maxOutputTokens).toBeUndefined();
    expect(model.inputPrice).toBeUndefined();
    expect(model.outputPrice).toBeUndefined();
    expect(model.family).toBeUndefined();
    expect(model.reasoning).toBeUndefined();
  });

  test("preserves provider argument correctly", () => {
    for (const provider of PROVIDER_IDS) {
      const model = normalizeModel(RAW_MINIMAL, provider);
      expect(model.provider).toBe(provider);
    }
  });
});

// ============================================================
// toModelsDevProviderId
// ============================================================

describe("toModelsDevProviderId", () => {
  test("maps gemini → google", () => {
    expect(toModelsDevProviderId("gemini")).toBe("google");
  });

  test("maps other providers 1:1", () => {
    expect(toModelsDevProviderId("openrouter")).toBe("openrouter");
    expect(toModelsDevProviderId("anthropic")).toBe("anthropic");
    expect(toModelsDevProviderId("openai")).toBe("openai");
    expect(toModelsDevProviderId("xai")).toBe("xai");
  });

  test("every PROVIDER_ID has a mapping", () => {
    for (const id of PROVIDER_IDS) {
      const mapped = toModelsDevProviderId(id);
      expect(typeof mapped).toBe("string");
      expect(mapped.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// getModelCreator
// ============================================================

describe("getModelCreator", () => {
  test("extracts org prefix from OpenRouter model ID", () => {
    const model = makeModel({
      provider: "openrouter",
      id: "anthropic/claude-sonnet-4-20250514",
    });
    const creator = getModelCreator(model);
    expect(creator.slug).toBe("anthropic");
    expect(creator.provider).toBe("anthropic"); // known mapping
  });

  test("returns 'openrouter' slug when no slash in OpenRouter model ID", () => {
    const model = makeModel({
      provider: "openrouter",
      id: "some-model-without-slash",
    });
    const creator = getModelCreator(model);
    expect(creator.slug).toBe("openrouter");
  });

  test("returns null provider for unknown OpenRouter org", () => {
    const model = makeModel({
      provider: "openrouter",
      id: "meta-llama/llama-3.1-405b",
    });
    const creator = getModelCreator(model);
    expect(creator.slug).toBe("meta-llama");
    expect(creator.provider).toBeNull(); // meta-llama is not a registered provider
  });

  test("maps known OpenRouter orgs to providers", () => {
    const testCases: [string, ProviderName][] = [
      ["anthropic/claude-sonnet-4", "anthropic"],
      ["openai/gpt-4o", "openai"],
      ["google/gemini-2.0-flash", "gemini"],
      ["xai/grok-3", "xai"],
    ];

    for (const [modelId, expectedProvider] of testCases) {
      const model = makeModel({ provider: "openrouter", id: modelId });
      const creator = getModelCreator(model);
      expect(creator.provider).toBe(expectedProvider);
    }
  });

  test("direct provider models use the provider itself as creator", () => {
    for (const provider of PROVIDER_IDS.filter((p) => p !== "openrouter")) {
      const model = makeModel({ provider, id: "some-model" });
      const creator = getModelCreator(model);
      expect(creator.provider).toBe(provider);
    }
  });
});

// ============================================================
// getCreatorLogoUrl / getProviderLogoUrl
// ============================================================

describe("logo URLs", () => {
  test("getCreatorLogoUrl returns models.dev URL", () => {
    expect(getCreatorLogoUrl("anthropic")).toBe("https://models.dev/logos/anthropic.svg");
    expect(getCreatorLogoUrl("meta-llama")).toBe("https://models.dev/logos/meta-llama.svg");
  });

  test("getProviderLogoUrl maps through toModelsDevProviderId", () => {
    expect(getProviderLogoUrl("gemini")).toBe("https://models.dev/logos/google.svg");
    expect(getProviderLogoUrl("anthropic")).toBe("https://models.dev/logos/anthropic.svg");
  });
});

// ============================================================
// getModelsForProvider
// ============================================================

describe("getModelsForProvider", () => {
  test("returns models for known provider", () => {
    const models = getModelsForProvider(MOCK_CATALOG, "anthropic");
    expect(models.length).toBe(2); // 3 in catalog, 1 deprecated = 2 returned
  });

  test("filters out deprecated models", () => {
    const models = getModelsForProvider(MOCK_CATALOG, "anthropic");
    const ids = models.map((m) => m.id);
    expect(ids).not.toContain("old-deprecated");
  });

  test("sorts by release_date descending (newest first)", () => {
    const models = getModelsForProvider(MOCK_CATALOG, "anthropic");
    expect(models[0]!.id).toBe("claude-sonnet-4-20250514"); // 2025-05-14
    expect(models[1]!.id).toBe("claude-haiku-3.5"); // 2024-10-22
  });

  test("maps gemini provider to google catalog key", () => {
    const models = getModelsForProvider(MOCK_CATALOG, "gemini");
    expect(models.length).toBe(1);
    expect(models[0]!.id).toBe("gemini-2.0-flash");
    expect(models[0]!.provider).toBe("gemini");
  });

  test("returns empty array for provider not in catalog", () => {
    const models = getModelsForProvider(MOCK_CATALOG, "xai");
    expect(models).toEqual([]);
  });

  test("returns empty array for empty catalog", () => {
    const models = getModelsForProvider({}, "anthropic");
    expect(models).toEqual([]);
  });
});

// ============================================================
// rankModelsBySearch
// ============================================================

describe("rankModelsBySearch", () => {
  const models: Model[] = [
    makeModel({ id: "gpt-4o", name: "GPT-4o" }),
    makeModel({ id: "gpt-4o-mini", name: "GPT-4o Mini" }),
    makeModel({ id: "claude-sonnet-4", name: "Claude Sonnet 4" }),
    makeModel({ id: "gemini-flash", name: "Gemini Flash" }),
    makeModel({ id: "grok-3", name: "Grok 3" }),
  ];

  test("empty term returns first N models (up to limit)", () => {
    const result = rankModelsBySearch(models, "", 3);
    expect(result.length).toBe(3);
    // Should be first 3 in original order
    expect(result[0]!.id).toBe("gpt-4o");
    expect(result[1]!.id).toBe("gpt-4o-mini");
    expect(result[2]!.id).toBe("claude-sonnet-4");
  });

  test("whitespace-only term treated as empty", () => {
    const result = rankModelsBySearch(models, "   ", 50);
    expect(result.length).toBe(models.length);
  });

  test("filters to matching models", () => {
    const result = rankModelsBySearch(models, "gpt");
    expect(result.every((m) => m.id.includes("gpt") || m.name.toLowerCase().includes("gpt"))).toBe(
      true,
    );
  });

  test("case-insensitive matching", () => {
    const result = rankModelsBySearch(models, "CLAUDE");
    expect(result.length).toBe(1);
    expect(result[0]!.id).toBe("claude-sonnet-4");
  });

  test("matches in name field", () => {
    const result = rankModelsBySearch(models, "Gemini");
    expect(result.length).toBe(1);
    expect(result[0]!.id).toBe("gemini-flash");
  });

  test("returns empty for no matches", () => {
    const result = rankModelsBySearch(models, "nonexistent");
    expect(result.length).toBe(0);
  });

  test("respects limit parameter", () => {
    const result = rankModelsBySearch(models, "g", 2); // matches gpt, gemini, grok
    expect(result.length).toBe(2);
  });

  test("earlier match position scores higher (closer to start of string)", () => {
    const result = rankModelsBySearch(models, "gpt");
    // "gpt-4o" should rank before "gpt-4o-mini" (same position but shorter id)
    expect(result[0]!.id).toBe("gpt-4o");
    expect(result[1]!.id).toBe("gpt-4o-mini");
  });
});

// ============================================================
// rankModelsBySearch — Property-Based
// ============================================================

describe("rankModelsBySearch — property-based", () => {
  const modelArb = fc.record({
    id: fc.string({ minLength: 1, maxLength: 50 }),
    name: fc.string({ minLength: 1, maxLength: 100 }),
    provider: fc.constantFrom(...PROVIDER_IDS),
  }) as fc.Arbitrary<Model>;

  test("result length never exceeds limit", () => {
    fc.assert(
      fc.property(
        fc.array(modelArb, { minLength: 0, maxLength: 20 }),
        fc.string(),
        fc.integer({ min: 1, max: 100 }),
        (models, term, limit) => {
          return rankModelsBySearch(models, term, limit).length <= limit;
        },
      ),
      { numRuns: 200 },
    );
  });

  test("result length never exceeds input length", () => {
    fc.assert(
      fc.property(
        fc.array(modelArb, { minLength: 0, maxLength: 20 }),
        fc.string(),
        (models, term) => {
          return rankModelsBySearch(models, term).length <= models.length;
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ============================================================
// filterModels
// ============================================================

describe("filterModels", () => {
  const testModels: Model[] = [
    makeModel({ id: "a", reasoning: true, toolCall: true, inputModalities: ["text", "image"], inputPrice: 3, openWeights: false }),
    makeModel({ id: "b", reasoning: false, toolCall: true, inputModalities: ["text"], inputPrice: 0, openWeights: true }),
    makeModel({ id: "c", reasoning: true, toolCall: false, inputModalities: ["text"], inputPrice: undefined, openWeights: false }),
    makeModel({ id: "d", reasoning: false, toolCall: false, inputModalities: ["text", "image"], inputPrice: 0.5, openWeights: true }),
  ];

  test("empty filters returns all models", () => {
    expect(filterModels(testModels, {}).length).toBe(4);
  });

  test("reasoning filter", () => {
    const result = filterModels(testModels, { reasoning: true });
    expect(result.map((m) => m.id)).toEqual(["a", "c"]);
  });

  test("toolCall filter", () => {
    const result = filterModels(testModels, { toolCall: true });
    expect(result.map((m) => m.id)).toEqual(["a", "b"]);
  });

  test("vision filter (inputModalities includes 'image')", () => {
    const result = filterModels(testModels, { vision: true });
    expect(result.map((m) => m.id)).toEqual(["a", "d"]);
  });

  test("openWeights filter", () => {
    const result = filterModels(testModels, { openWeights: true });
    expect(result.map((m) => m.id)).toEqual(["b", "d"]);
  });

  test("free filter (inputPrice === 0)", () => {
    const result = filterModels(testModels, { free: true });
    expect(result.map((m) => m.id)).toEqual(["b"]);
  });

  test("combined filters (AND logic)", () => {
    const result = filterModels(testModels, { reasoning: true, toolCall: true });
    expect(result.map((m) => m.id)).toEqual(["a"]);
  });

  test("filters returning no results", () => {
    const result = filterModels(testModels, { reasoning: true, free: true });
    expect(result.length).toBe(0);
  });

  test("false filter values are ignored (not applied)", () => {
    const result = filterModels(testModels, { reasoning: false });
    expect(result.length).toBe(4); // false means "don't filter"
  });
});

// ============================================================
// filterModels — Property-Based
// ============================================================

describe("filterModels — property-based", () => {
  test("empty filters always returns same-length array", () => {
    const modelArb = fc.record({
      id: fc.string({ minLength: 1 }),
      name: fc.string({ minLength: 1 }),
      provider: fc.constantFrom(...PROVIDER_IDS),
    }) as fc.Arbitrary<Model>;

    fc.assert(
      fc.property(fc.array(modelArb, { maxLength: 20 }), (models) => {
        return filterModels(models, {}).length === models.length;
      }),
      { numRuns: 200 },
    );
  });

  test("filtering never increases array length", () => {
    const modelArb = fc.record({
      id: fc.string({ minLength: 1 }),
      name: fc.string({ minLength: 1 }),
      provider: fc.constantFrom(...PROVIDER_IDS),
      reasoning: fc.option(fc.boolean(), { nil: undefined }),
      toolCall: fc.option(fc.boolean(), { nil: undefined }),
      openWeights: fc.option(fc.boolean(), { nil: undefined }),
      inputPrice: fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: undefined }),
    }) as fc.Arbitrary<Model>;

    const filtersArb = fc.record({
      reasoning: fc.option(fc.boolean(), { nil: undefined }),
      toolCall: fc.option(fc.boolean(), { nil: undefined }),
      openWeights: fc.option(fc.boolean(), { nil: undefined }),
      free: fc.option(fc.boolean(), { nil: undefined }),
    }) as fc.Arbitrary<ModelFilters>;

    fc.assert(
      fc.property(fc.array(modelArb, { maxLength: 20 }), filtersArb, (models, filters) => {
        return filterModels(models, filters).length <= models.length;
      }),
      { numRuns: 200 },
    );
  });
});

// ============================================================
// sortModels
// ============================================================

describe("sortModels", () => {
  const testModels: Model[] = [
    makeModel({ id: "b", name: "Bravo", inputPrice: 3, contextLength: 128000, releaseDate: "2025-01-01" }),
    makeModel({ id: "a", name: "Alpha", inputPrice: 1, contextLength: 200000, releaseDate: "2025-06-01" }),
    makeModel({ id: "c", name: "Charlie", inputPrice: undefined, contextLength: undefined, releaseDate: undefined }),
    makeModel({ id: "d", name: "Delta", inputPrice: 0, contextLength: 32000, releaseDate: "2024-06-01" }),
  ];

  test("sort by name: alphabetical", () => {
    const result = sortModels(testModels, "name");
    expect(result.map((m) => m.id)).toEqual(["a", "b", "c", "d"]);
  });

  test("sort by newest: most recent first", () => {
    const result = sortModels(testModels, "newest");
    expect(result[0]!.id).toBe("a"); // 2025-06-01
    expect(result[1]!.id).toBe("b"); // 2025-01-01
    expect(result[2]!.id).toBe("d"); // 2024-06-01
    expect(result[3]!.id).toBe("c"); // undefined → last
  });

  test("sort by price-asc: cheapest first", () => {
    const result = sortModels(testModels, "price-asc");
    expect(result[0]!.id).toBe("d"); // $0
    expect(result[1]!.id).toBe("a"); // $1
    expect(result[2]!.id).toBe("b"); // $3
    expect(result[3]!.id).toBe("c"); // undefined → Infinity → last
  });

  test("sort by price-desc: most expensive first", () => {
    const result = sortModels(testModels, "price-desc");
    expect(result[0]!.id).toBe("b"); // $3
    expect(result[1]!.id).toBe("a"); // $1
    expect(result[2]!.id).toBe("d"); // $0
    expect(result[3]!.id).toBe("c"); // undefined → -1 → last
  });

  test("sort by context: largest context first", () => {
    const result = sortModels(testModels, "context");
    expect(result[0]!.id).toBe("a"); // 200k
    expect(result[1]!.id).toBe("b"); // 128k
    expect(result[2]!.id).toBe("d"); // 32k
    expect(result[3]!.id).toBe("c"); // undefined → 0 → last
  });

  test("sort does not mutate the original array", () => {
    const original = [...testModels];
    sortModels(testModels, "name");
    expect(testModels.map((m) => m.id)).toEqual(original.map((m) => m.id));
  });
});

// ============================================================
// sortModels — Property-Based
// ============================================================

describe("sortModels — property-based", () => {
  const modelArb = fc.record({
    id: fc.string({ minLength: 1 }),
    name: fc.string({ minLength: 1 }),
    provider: fc.constantFrom(...PROVIDER_IDS),
    inputPrice: fc.option(fc.double({ min: 0, max: 1000, noNaN: true }), { nil: undefined }),
    contextLength: fc.option(fc.nat({ max: 2_000_000 }), { nil: undefined }),
    releaseDate: fc.option(
      fc.tuple(
        fc.integer({ min: 2020, max: 2030 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
      ).map(([y, m, d]) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`),
      { nil: undefined },
    ),
  }) as fc.Arbitrary<Model>;

  const sortKeyArb = fc.constantFrom<ModelSortKey>("newest", "price-asc", "price-desc", "context", "name");

  test("sort always returns same-length array", () => {
    fc.assert(
      fc.property(fc.array(modelArb, { maxLength: 20 }), sortKeyArb, (models, key) => {
        return sortModels(models, key).length === models.length;
      }),
      { numRuns: 200 },
    );
  });

  test("sort is idempotent: sorting twice gives same order", () => {
    fc.assert(
      fc.property(fc.array(modelArb, { maxLength: 20 }), sortKeyArb, (models, key) => {
        const once = sortModels(models, key);
        const twice = sortModels(once, key);
        return JSON.stringify(once.map((m) => m.id)) === JSON.stringify(twice.map((m) => m.id));
      }),
      { numRuns: 200 },
    );
  });

  test("sort never mutates input", () => {
    fc.assert(
      fc.property(fc.array(modelArb, { maxLength: 20 }), sortKeyArb, (models, key) => {
        const idsBefore = models.map((m) => m.id).join(",");
        sortModels(models, key);
        const idsAfter = models.map((m) => m.id).join(",");
        return idsBefore === idsAfter;
      }),
      { numRuns: 200 },
    );
  });
});

// ============================================================
// formatPrice
// ============================================================

describe("formatPrice", () => {
  test("undefined → '?'", () => {
    expect(formatPrice(undefined)).toBe("?");
  });

  test("0 → 'free'", () => {
    expect(formatPrice(0)).toBe("free");
  });

  test("small price < 0.01 → '<$0.01'", () => {
    expect(formatPrice(0.005)).toBe("<$0.01");
    expect(formatPrice(0.001)).toBe("<$0.01");
    expect(formatPrice(0.009)).toBe("<$0.01");
  });

  test("normal prices formatted with 2 decimal places", () => {
    expect(formatPrice(3)).toBe("$3.00");
    expect(formatPrice(15)).toBe("$15.00");
    expect(formatPrice(0.8)).toBe("$0.80");
    expect(formatPrice(0.1)).toBe("$0.10");
    expect(formatPrice(0.01)).toBe("$0.01");
  });

  test("exactly 0.01 → '$0.01' (not '<$0.01')", () => {
    expect(formatPrice(0.01)).toBe("$0.01");
  });
});

// ============================================================
// formatContext
// ============================================================

describe("formatContext", () => {
  test("undefined → '?'", () => {
    expect(formatContext(undefined)).toBe("?");
  });

  test("0 → '?' (falsy)", () => {
    expect(formatContext(0)).toBe("?");
  });

  test("standard context sizes formatted as Xk", () => {
    expect(formatContext(128000)).toBe("128k");
    expect(formatContext(200000)).toBe("200k");
    expect(formatContext(32000)).toBe("32k");
    expect(formatContext(4096)).toBe("4k");
    expect(formatContext(8192)).toBe("8k");
  });

  test("million+ tokens formatted as X.XM", () => {
    expect(formatContext(1_000_000)).toBe("1.0M");
    expect(formatContext(2_000_000)).toBe("2.0M");
    expect(formatContext(1_500_000)).toBe("1.5M");
  });

  test("small values round to nearest k", () => {
    expect(formatContext(1000)).toBe("1k");
    expect(formatContext(500)).toBe("1k"); // rounds 0.5 to 1
    expect(formatContext(1500)).toBe("2k"); // rounds 1.5 to 2
  });
});
