/**
 * providers.test.ts — Tests for src/shared/providers.ts
 *
 * Provider registry lookups. Tests cover:
 *
 *  - PROVIDER_IDS: canonical list completeness
 *  - isProviderName: true for all known providers, false for unknowns
 *  - getProviderMeta: returns correct metadata for each provider
 *  - getProviderLabel: returns human-readable labels
 *  - PROVIDERS registry: all entries have required fields
 */

import { test, expect, describe } from "bun:test";
import * as fc from "fast-check";

import {
  PROVIDER_IDS,
  PROVIDERS,
  getProviderMeta,
  getProviderLabel,
  isProviderName,
  type ProviderName,
  type ProviderMeta,
} from "../shared/providers.ts";

// ============================================================
// PROVIDER_IDS
// ============================================================

describe("PROVIDER_IDS", () => {
  test("contains exactly 5 providers", () => {
    expect(PROVIDER_IDS.length).toBe(5);
  });

  test("contains the expected provider names", () => {
    expect(PROVIDER_IDS).toContain("openrouter");
    expect(PROVIDER_IDS).toContain("anthropic");
    expect(PROVIDER_IDS).toContain("openai");
    expect(PROVIDER_IDS).toContain("gemini");
    expect(PROVIDER_IDS).toContain("xai");
  });

  test("has no duplicates", () => {
    const unique = new Set(PROVIDER_IDS);
    expect(unique.size).toBe(PROVIDER_IDS.length);
  });
});

// ============================================================
// PROVIDERS registry
// ============================================================

describe("PROVIDERS registry", () => {
  test("has an entry for every PROVIDER_ID", () => {
    for (const id of PROVIDER_IDS) {
      const entry = PROVIDERS.find((p) => p.id === id);
      expect(entry).toBeDefined();
    }
  });

  test("every entry has all required fields populated", () => {
    for (const provider of PROVIDERS) {
      expect(typeof provider.id).toBe("string");
      expect(provider.id.length).toBeGreaterThan(0);
      expect(typeof provider.label).toBe("string");
      expect(provider.label.length).toBeGreaterThan(0);
      expect(typeof provider.description).toBe("string");
      expect(provider.description.length).toBeGreaterThan(0);
      expect(typeof provider.keyPlaceholder).toBe("string");
      expect(provider.keyPlaceholder.length).toBeGreaterThan(0);
      expect(typeof provider.docsUrl).toBe("string");
      expect(provider.docsUrl).toMatch(/^https:\/\//);
    }
  });

  test("registry count matches PROVIDER_IDS count", () => {
    expect(PROVIDERS.length).toBe(PROVIDER_IDS.length);
  });
});

// ============================================================
// isProviderName
// ============================================================

describe("isProviderName", () => {
  test("returns true for all PROVIDER_IDS", () => {
    for (const id of PROVIDER_IDS) {
      expect(isProviderName(id)).toBe(true);
    }
  });

  test("returns false for unknown strings", () => {
    expect(isProviderName("unknown")).toBe(false);
    expect(isProviderName("")).toBe(false);
    expect(isProviderName("google")).toBe(false);
    expect(isProviderName("mistral")).toBe(false);
    expect(isProviderName("claude")).toBe(false);
  });

  test("returns false for close but wrong names", () => {
    expect(isProviderName("Anthropic")).toBe(false); // case-sensitive
    expect(isProviderName("OpenAI")).toBe(false);
    expect(isProviderName("openRouter")).toBe(false);
    expect(isProviderName("XAI")).toBe(false);
  });

  test("property: random strings are almost never valid provider names", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => !PROVIDER_IDS.includes(s as ProviderName)),
        (value) => !isProviderName(value),
      ),
      { numRuns: 500 },
    );
  });
});

// ============================================================
// getProviderMeta
// ============================================================

describe("getProviderMeta", () => {
  test("returns correct metadata for each provider", () => {
    const expected: Record<ProviderName, { label: string; keyPrefix: string }> = {
      openrouter: { label: "OpenRouter", keyPrefix: "sk-or-v1-" },
      anthropic: { label: "Anthropic", keyPrefix: "sk-ant-" },
      openai: { label: "OpenAI", keyPrefix: "sk-" },
      gemini: { label: "Gemini", keyPrefix: "AIza" },
      xai: { label: "X-AI", keyPrefix: "xai-" },
    };

    for (const [id, exp] of Object.entries(expected)) {
      const meta = getProviderMeta(id as ProviderName);
      expect(meta.id).toBe(id as ProviderName);
      expect(meta.label).toBe(exp.label);
      expect(meta.keyPlaceholder).toStartWith(exp.keyPrefix);
    }
  });

  test("throws for unknown provider", () => {
    expect(() => getProviderMeta("unknown" as ProviderName)).toThrow(
      "Unknown provider",
    );
  });

  test("returned object has all ProviderMeta fields", () => {
    const meta = getProviderMeta("anthropic");
    expect(meta).toHaveProperty("id");
    expect(meta).toHaveProperty("label");
    expect(meta).toHaveProperty("description");
    expect(meta).toHaveProperty("keyPlaceholder");
    expect(meta).toHaveProperty("docsUrl");
  });
});

// ============================================================
// getProviderLabel
// ============================================================

describe("getProviderLabel", () => {
  test("returns human-readable labels", () => {
    expect(getProviderLabel("openrouter")).toBe("OpenRouter");
    expect(getProviderLabel("anthropic")).toBe("Anthropic");
    expect(getProviderLabel("openai")).toBe("OpenAI");
    expect(getProviderLabel("gemini")).toBe("Gemini");
    expect(getProviderLabel("xai")).toBe("X-AI");
  });

  test("label is a non-empty string for every provider", () => {
    for (const id of PROVIDER_IDS) {
      const label = getProviderLabel(id);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  test("throws for unknown provider (delegates to getProviderMeta)", () => {
    expect(() => getProviderLabel("nope" as ProviderName)).toThrow();
  });
});
