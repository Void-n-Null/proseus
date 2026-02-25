/**
 * ids.test.ts — Tests for src/shared/ids.ts
 *
 * Nanoid-based ID generation using crypto.getRandomValues. Tests cover:
 *
 *  - Format: always 12 characters
 *  - Alphabet: only alphanumeric [0-9A-Za-z]
 *  - Uniqueness: no collisions across large batches
 *  - Distribution: no systematic bias in character positions
 *  - Property-based: all properties verified across random runs
 */

import { test, expect, describe } from "bun:test";
import * as fc from "fast-check";

import { generateId } from "../shared/ids.ts";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ALPHABET_SET = new Set(ALPHABET);

// ============================================================
// Format & Alphabet — Traditional
// ============================================================

describe("generateId", () => {
  test("returns a 12-character string", () => {
    const id = generateId();
    expect(typeof id).toBe("string");
    expect(id.length).toBe(12);
  });

  test("contains only alphanumeric characters", () => {
    const id = generateId();
    for (const char of id) {
      expect(ALPHABET_SET.has(char)).toBe(true);
    }
  });

  test("successive calls produce different IDs", () => {
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
  });

  test("1000 IDs have zero collisions", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(1000);
  });
});

// ============================================================
// Property-Based — fast-check
// ============================================================

describe("generateId — property-based", () => {
  test("always returns exactly 12 characters", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        return generateId().length === 12;
      }),
      { numRuns: 500 },
    );
  });

  test("every character is in the alphanumeric alphabet", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const id = generateId();
        return [...id].every((ch) => ALPHABET_SET.has(ch));
      }),
      { numRuns: 500 },
    );
  });

  test("matches the regex pattern ^[0-9A-Za-z]{12}$", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        return /^[0-9A-Za-z]{12}$/.test(generateId());
      }),
      { numRuns: 500 },
    );
  });

  test("10_000 IDs have zero collisions", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(10_000);
  });
});

// ============================================================
// Distribution Analysis
// ============================================================

describe("generateId — distribution", () => {
  test("character frequency is approximately uniform across positions", () => {
    // Generate 5000 IDs and check that no single character dominates
    // any position. With 62 possible chars and 5000 samples, expected
    // frequency is ~80.6 per char per position. We check that no
    // char exceeds 3x expected (very loose — catches systematic bias).
    const NUM_SAMPLES = 5000;
    const NUM_POSITIONS = 12;
    const expectedPerChar = NUM_SAMPLES / ALPHABET.length;
    const MAX_ALLOWED = expectedPerChar * 3;

    const positionCounts: Map<string, number>[] = Array.from(
      { length: NUM_POSITIONS },
      () => new Map(),
    );

    for (let i = 0; i < NUM_SAMPLES; i++) {
      const id = generateId();
      for (let pos = 0; pos < NUM_POSITIONS; pos++) {
        const ch = id[pos]!;
        const counts = positionCounts[pos]!;
        counts.set(ch, (counts.get(ch) ?? 0) + 1);
      }
    }

    for (let pos = 0; pos < NUM_POSITIONS; pos++) {
      for (const [char, count] of positionCounts[pos]!) {
        expect(count).toBeLessThan(MAX_ALLOWED);
      }
    }
  });

  test("all 62 alphabet characters appear in a batch of 500 IDs", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      for (const ch of generateId()) {
        seen.add(ch);
      }
    }
    // With 500 * 12 = 6000 character draws from 62 possible, all should appear
    expect(seen.size).toBe(62);
  });
});
