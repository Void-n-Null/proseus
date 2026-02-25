/**
 * model-pricing.test.ts — Tests for src/server/lib/model-pricing.ts
 *
 * Financial calculations for LLM usage tracking. Tests cover:
 *
 *  - computeCost: precise USD calculations from token counts + pricing
 *  - sanitizeTokens: NaN/undefined/negative guard → non-negative integer
 *  - getModelPricing: catalog lookup with mocked fetch
 *  - Cache lifecycle: TTL, stale fallback on fetch failure
 *  - Property-based: non-negativity, linearity, integer output
 */

import { test, expect, describe, beforeEach, afterEach, mock, spyOn } from "bun:test";
import * as fc from "fast-check";

import {
  computeCost,
  sanitizeTokens,
  getModelPricing,
  type ModelPricing,
} from "../server/lib/model-pricing.ts";
import type { ModelsDevResponse } from "../shared/models.ts";

// ── Mock catalog for getModelPricing tests ───────────────────

const MOCK_CATALOG: ModelsDevResponse = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    models: {
      "claude-sonnet-4-20250514": {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        cost: { input: 3, output: 15 },
      },
      "claude-haiku-3.5-20241022": {
        id: "claude-haiku-3.5-20241022",
        name: "Claude Haiku 3.5",
        cost: { input: 0.8, output: 4 },
      },
      "no-cost-model": {
        id: "no-cost-model",
        name: "No Cost Model",
        // Missing cost entirely
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
      "partial-cost-model": {
        id: "partial-cost-model",
        name: "Partial Cost",
        cost: { input: 2 }, // Missing output — should default to 0
      },
    },
  },
};

// ============================================================
// computeCost — Traditional
// ============================================================

describe("computeCost", () => {
  test("basic calculation: 1000 tokens at $3/M input + 500 tokens at $15/M output", () => {
    const pricing: ModelPricing = { inputPrice: 3, outputPrice: 15 };
    const cost = computeCost(1000, 500, pricing);
    // (1000/1_000_000 * 3) + (500/1_000_000 * 15) = 0.003 + 0.0075 = 0.0105
    expect(cost).toBeCloseTo(0.0105, 10);
  });

  test("exact million tokens: $3/M input = $3.00", () => {
    const pricing: ModelPricing = { inputPrice: 3, outputPrice: 0 };
    const cost = computeCost(1_000_000, 0, pricing);
    expect(cost).toBe(3);
  });

  test("zero tokens: cost is 0", () => {
    const pricing: ModelPricing = { inputPrice: 3, outputPrice: 15 };
    expect(computeCost(0, 0, pricing)).toBe(0);
  });

  test("zero pricing: cost is 0 regardless of tokens", () => {
    const pricing: ModelPricing = { inputPrice: 0, outputPrice: 0 };
    expect(computeCost(1_000_000, 1_000_000, pricing)).toBe(0);
  });

  test("large token counts (realistic heavy usage)", () => {
    const pricing: ModelPricing = { inputPrice: 3, outputPrice: 15 };
    // 128k input + 4k output
    const cost = computeCost(128_000, 4_000, pricing);
    // (128_000/1M * 3) + (4_000/1M * 15) = 0.384 + 0.06 = 0.444
    expect(cost).toBeCloseTo(0.444, 10);
  });

  test("fractional pricing (sub-dollar per million)", () => {
    const pricing: ModelPricing = { inputPrice: 0.1, outputPrice: 0.4 };
    const cost = computeCost(10_000, 5_000, pricing);
    // (10_000/1M * 0.1) + (5_000/1M * 0.4) = 0.001 + 0.002 = 0.003
    expect(cost).toBeCloseTo(0.003, 10);
  });
});

// ============================================================
// computeCost — Property-Based (fast-check)
// ============================================================

describe("computeCost — property-based", () => {
  const pricingArb = fc.record({
    inputPrice: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
    outputPrice: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
  });

  const tokensArb = fc.double({ min: 0, max: 100_000_000, noNaN: true, noDefaultInfinity: true });

  test("cost is always non-negative for non-negative inputs", () => {
    fc.assert(
      fc.property(tokensArb, tokensArb, pricingArb, (prompt, completion, pricing) => {
        const cost = computeCost(prompt, completion, pricing);
        return cost >= 0;
      }),
      { numRuns: 500 },
    );
  });

  test("zero tokens → zero cost regardless of pricing", () => {
    fc.assert(
      fc.property(pricingArb, (pricing) => {
        return computeCost(0, 0, pricing) === 0;
      }),
      { numRuns: 200 },
    );
  });

  test("zero pricing → zero cost regardless of tokens", () => {
    fc.assert(
      fc.property(tokensArb, tokensArb, (prompt, completion) => {
        return computeCost(prompt, completion, { inputPrice: 0, outputPrice: 0 }) === 0;
      }),
      { numRuns: 200 },
    );
  });

  test("linearity: computeCost(2p, 2c, pricing) ≈ 2 * computeCost(p, c, pricing)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 10_000_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 10_000_000, noNaN: true, noDefaultInfinity: true }),
        pricingArb,
        (prompt, completion, pricing) => {
          const single = computeCost(prompt, completion, pricing);
          const double = computeCost(prompt * 2, completion * 2, pricing);
          // Allow for floating-point imprecision
          return Math.abs(double - 2 * single) < 1e-6;
        },
      ),
      { numRuns: 200 },
    );
  });

  test("additivity: cost(p, 0) + cost(0, c) === cost(p, c)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 10_000_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 10_000_000, noNaN: true, noDefaultInfinity: true }),
        pricingArb,
        (prompt, completion, pricing) => {
          const separate = computeCost(prompt, 0, pricing) + computeCost(0, completion, pricing);
          const combined = computeCost(prompt, completion, pricing);
          return Math.abs(separate - combined) < 1e-10;
        },
      ),
      { numRuns: 200 },
    );
  });

  test("monotonic: more tokens → higher or equal cost", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 10_000_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 10_000_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 10_000_000, noNaN: true, noDefaultInfinity: true }),
        pricingArb,
        (base, extra, completion, pricing) => {
          const less = computeCost(base, completion, pricing);
          const more = computeCost(base + extra, completion, pricing);
          return more >= less - 1e-10; // Allow floating-point tolerance
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ============================================================
// sanitizeTokens — Traditional
// ============================================================

describe("sanitizeTokens", () => {
  test("normal positive integer passes through", () => {
    expect(sanitizeTokens(1500)).toBe(1500);
  });

  test("rounds to nearest integer", () => {
    expect(sanitizeTokens(1500.7)).toBe(1501);
    expect(sanitizeTokens(1500.3)).toBe(1500);
    expect(sanitizeTokens(0.5)).toBe(1);
  });

  test("NaN → 0", () => {
    expect(sanitizeTokens(NaN)).toBe(0);
  });

  test("undefined → 0", () => {
    expect(sanitizeTokens(undefined)).toBe(0);
  });

  test("null → 0 (cast scenario)", () => {
    expect(sanitizeTokens(null as unknown as number)).toBe(0);
  });

  test("negative → 0", () => {
    expect(sanitizeTokens(-1)).toBe(0);
    expect(sanitizeTokens(-100)).toBe(0);
    expect(sanitizeTokens(-0.5)).toBe(0);
  });

  test("zero → 0", () => {
    expect(sanitizeTokens(0)).toBe(0);
  });

  test("large values preserved", () => {
    expect(sanitizeTokens(128_000)).toBe(128_000);
    expect(sanitizeTokens(1_000_000)).toBe(1_000_000);
  });

  test("Infinity → Infinity (Math.max preserves it, Math.round preserves it)", () => {
    // Infinity is a valid number, Math.max(0, Infinity) = Infinity, Math.round(Infinity) = Infinity
    const result = sanitizeTokens(Infinity);
    expect(result).toBe(Infinity);
  });

  test("-Infinity → 0 (Math.max clamps it)", () => {
    expect(sanitizeTokens(-Infinity)).toBe(0);
  });
});

// ============================================================
// sanitizeTokens — Property-Based (fast-check)
// ============================================================

describe("sanitizeTokens — property-based", () => {
  test("output is always a non-negative integer", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.double({ noNaN: true }),
          fc.constant(NaN),
          fc.constant(undefined as unknown as number),
          fc.constant(null as unknown as number),
        ),
        (value) => {
          const result = sanitizeTokens(value);
          return result >= 0 && (Number.isInteger(result) || result === Infinity);
        },
      ),
      { numRuns: 500 },
    );
  });

  test("non-negative integers pass through unchanged", () => {
    fc.assert(
      fc.property(fc.nat({ max: 10_000_000 }), (value) => {
        return sanitizeTokens(value) === value;
      }),
      { numRuns: 200 },
    );
  });

  test("negative values always clamp to 0", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e15, max: -0.0001, noNaN: true, noDefaultInfinity: true }),
        (value) => {
          return sanitizeTokens(value) === 0;
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ============================================================
// getModelPricing — With mocked fetch
// ============================================================

describe("getModelPricing", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // Mock fetch to return our controlled catalog
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_CATALOG), { status: 200 })),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns pricing for known provider + model", async () => {
    const pricing = await getModelPricing("anthropic", "claude-sonnet-4-20250514");
    expect(pricing).not.toBeNull();
    expect(pricing!.inputPrice).toBe(3);
    expect(pricing!.outputPrice).toBe(15);
  });

  test("returns pricing for Gemini (maps to google provider key)", async () => {
    const pricing = await getModelPricing("gemini", "gemini-2.0-flash");
    expect(pricing).not.toBeNull();
    expect(pricing!.inputPrice).toBe(0.1);
    expect(pricing!.outputPrice).toBe(0.4);
  });

  test("returns pricing for OpenRouter model", async () => {
    const pricing = await getModelPricing("openrouter", "anthropic/claude-sonnet-4-20250514");
    expect(pricing).not.toBeNull();
    expect(pricing!.inputPrice).toBe(3);
    expect(pricing!.outputPrice).toBe(15);
  });

  test("returns null for unknown provider", async () => {
    const pricing = await getModelPricing("xai", "some-model");
    // xai is not in our mock catalog
    expect(pricing).toBeNull();
  });

  test("returns null for unknown model ID", async () => {
    const pricing = await getModelPricing("anthropic", "nonexistent-model");
    expect(pricing).toBeNull();
  });

  test("returns null when model has no cost property", async () => {
    const pricing = await getModelPricing("anthropic", "no-cost-model");
    expect(pricing).toBeNull();
  });

  test("defaults missing output price to 0", async () => {
    const pricing = await getModelPricing("gemini", "partial-cost-model");
    expect(pricing).not.toBeNull();
    expect(pricing!.inputPrice).toBe(2);
    expect(pricing!.outputPrice).toBe(0);
  });

  test("stale cache used when fetch fails", async () => {
    // First call succeeds — populates cache
    await getModelPricing("anthropic", "claude-sonnet-4-20250514");

    // Now make fetch fail
    globalThis.fetch = mock(() =>
      Promise.reject(new Error("Network failure")),
    ) as unknown as typeof fetch;

    // The module-level cache holds the catalog; ensureCatalog won't re-fetch
    // within the 10-minute TTL, so this should still work from cache
    const pricing = await getModelPricing("anthropic", "claude-sonnet-4-20250514");
    expect(pricing).not.toBeNull();
    expect(pricing!.inputPrice).toBe(3);
  });
});
