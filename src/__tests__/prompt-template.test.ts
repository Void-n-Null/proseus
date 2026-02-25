/**
 * prompt-template.test.ts — Tests for src/shared/prompt-template.ts
 *
 * Prompt template slot management, macro substitution, and example dialogue
 * parsing. Tests cover:
 *
 *  - mergeWithDefaults: slot completeness, order preservation, state merging,
 *    new slot injection, empty saved template
 *  - applyMacros: {{char}} and {{user}} substitution, multiple occurrences,
 *    idempotence, no-op for missing macros
 *  - parseMesExample: <START> block parsing, empty input, single/multiple
 *    blocks, case-insensitive tags, whitespace handling
 *  - Property-based: merge completeness, macro idempotence, parseMesExample
 *    never throws
 */

import { test, expect, describe } from "bun:test";
import * as fc from "fast-check";

import {
  mergeWithDefaults,
  applyMacros,
  parseMesExample,
  DEFAULT_PROMPT_TEMPLATE,
  DEFAULT_MAIN_PROMPT,
  SLOT_META,
  type PromptTemplate,
  type PromptSlot,
  type SlotId,
} from "../shared/prompt-template.ts";

// ── Helpers ──────────────────────────────────────────────────

const ALL_SLOT_IDS = Object.keys(SLOT_META) as SlotId[];
const PRE_HISTORY_IDS = ALL_SLOT_IDS.filter((id) => SLOT_META[id].zone === "pre_history");
const HISTORY_IDS = ALL_SLOT_IDS.filter((id) => SLOT_META[id].zone === "history");
const POST_HISTORY_IDS = ALL_SLOT_IDS.filter((id) => SLOT_META[id].zone === "post_history");

function slotIds(template: PromptTemplate): SlotId[] {
  return template.slots.map((s) => s.id);
}

// ============================================================
// mergeWithDefaults — Traditional
// ============================================================

describe("mergeWithDefaults", () => {
  test("returns all slot IDs when saved is the default template", () => {
    const result = mergeWithDefaults(DEFAULT_PROMPT_TEMPLATE);
    const ids = slotIds(result);
    for (const slotId of ALL_SLOT_IDS) {
      expect(ids).toContain(slotId);
    }
    expect(ids.length).toBe(ALL_SLOT_IDS.length);
  });

  test("preserves saved slot enabled/disabled state", () => {
    const saved: PromptTemplate = {
      slots: DEFAULT_PROMPT_TEMPLATE.slots.map((s) => ({
        ...s,
        enabled: s.id === "main" ? false : s.enabled,
      })),
    };
    const result = mergeWithDefaults(saved);
    const mainSlot = result.slots.find((s) => s.id === "main");
    expect(mainSlot?.enabled).toBe(false);
  });

  test("preserves saved custom content", () => {
    const saved: PromptTemplate = {
      slots: DEFAULT_PROMPT_TEMPLATE.slots.map((s) => ({
        ...s,
        content: s.id === "main" ? "Custom prompt text" : s.content,
      })),
    };
    const result = mergeWithDefaults(saved);
    const mainSlot = result.slots.find((s) => s.id === "main");
    expect(mainSlot?.content).toBe("Custom prompt text");
  });

  test("adds missing slots from defaults when saved has fewer slots", () => {
    // Saved template with only 3 slots — rest should be filled from defaults
    const saved: PromptTemplate = {
      slots: [
        { id: "main", enabled: true, content: "My prompt" },
        { id: "history", enabled: true },
        { id: "post_history", enabled: true },
      ],
    };
    const result = mergeWithDefaults(saved);
    const ids = slotIds(result);

    // All default slot IDs should be present
    for (const slotId of ALL_SLOT_IDS) {
      expect(ids).toContain(slotId);
    }
    expect(ids.length).toBe(ALL_SLOT_IDS.length);
  });

  test("preserves pre_history slot order from saved template", () => {
    // Reverse the pre-history order
    const reversedPreHistory: PromptSlot[] = [...PRE_HISTORY_IDS].reverse().map((id) => ({
      id,
      enabled: true,
    }));
    const saved: PromptTemplate = {
      slots: [
        ...reversedPreHistory,
        { id: "history", enabled: true },
        { id: "post_history", enabled: true },
        { id: "assistant_prefill", enabled: false },
      ],
    };

    const result = mergeWithDefaults(saved);
    const resultPreHistory = result.slots.filter(
      (s) => SLOT_META[s.id].zone === "pre_history",
    );

    // Order should match the saved reversed order
    const resultPreIds = resultPreHistory.map((s) => s.id);
    const expectedReversed = [...PRE_HISTORY_IDS].reverse();
    expect(resultPreIds).toEqual(expectedReversed);
  });

  test("history and post_history zones maintain default order", () => {
    const result = mergeWithDefaults(DEFAULT_PROMPT_TEMPLATE);
    const historySlots = result.slots.filter((s) => SLOT_META[s.id].zone === "history");
    const postHistorySlots = result.slots.filter((s) => SLOT_META[s.id].zone === "post_history");

    expect(historySlots.map((s) => s.id)).toEqual(HISTORY_IDS);
    expect(postHistorySlots.map((s) => s.id)).toEqual(POST_HISTORY_IDS);
  });

  test("zone order is always pre_history → history → post_history", () => {
    const result = mergeWithDefaults(DEFAULT_PROMPT_TEMPLATE);
    const zones = result.slots.map((s) => SLOT_META[s.id].zone);

    // Find first index of each zone
    const preIdx = zones.indexOf("pre_history");
    const histIdx = zones.indexOf("history");
    const postIdx = zones.indexOf("post_history");

    expect(preIdx).toBeLessThan(histIdx);
    expect(histIdx).toBeLessThan(postIdx);
  });

  test("handles empty saved template (no slots)", () => {
    const saved: PromptTemplate = { slots: [] };
    const result = mergeWithDefaults(saved);

    // Should return all defaults
    const ids = slotIds(result);
    for (const slotId of ALL_SLOT_IDS) {
      expect(ids).toContain(slotId);
    }
  });

  test("preserves flattenHistory flag from saved", () => {
    const saved: PromptTemplate = {
      slots: DEFAULT_PROMPT_TEMPLATE.slots,
      flattenHistory: true,
    };
    const result = mergeWithDefaults(saved);
    expect(result.flattenHistory).toBe(true);
  });

  test("defaults flattenHistory to false when not set", () => {
    const saved: PromptTemplate = {
      slots: DEFAULT_PROMPT_TEMPLATE.slots,
    };
    const result = mergeWithDefaults(saved);
    expect(result.flattenHistory).toBe(false);
  });
});

// ============================================================
// mergeWithDefaults — Property-Based
// ============================================================

describe("mergeWithDefaults — property-based", () => {
  // Arbitrary that produces templates with unique slot IDs (realistic input)
  const templateArb = fc
    .subarray([...ALL_SLOT_IDS], { minLength: 0 })
    .chain((ids) =>
      fc.tuple(
        fc.array(fc.boolean(), { minLength: ids.length, maxLength: ids.length }),
        fc.option(fc.boolean(), { nil: undefined }),
      ).map(([enabledArr, flattenHistory]) => ({
        slots: ids.map((id, i) => ({
          id,
          enabled: enabledArr[i] ?? true,
        })),
        flattenHistory,
      })),
    ) as fc.Arbitrary<PromptTemplate>;

  test("output always contains all default slot IDs", () => {
    fc.assert(
      fc.property(templateArb, (saved) => {
        const result = mergeWithDefaults(saved);
        const ids = new Set(slotIds(result));
        return ALL_SLOT_IDS.every((id) => ids.has(id));
      }),
      { numRuns: 200 },
    );
  });

  test("output slot count equals the number of unique slot IDs", () => {
    fc.assert(
      fc.property(templateArb, (saved) => {
        const result = mergeWithDefaults(saved);
        return result.slots.length === ALL_SLOT_IDS.length;
      }),
      { numRuns: 200 },
    );
  });

  test("zone ordering is always maintained: pre < history < post", () => {
    fc.assert(
      fc.property(templateArb, (saved) => {
        const result = mergeWithDefaults(saved);
        const zones = result.slots.map((s) => SLOT_META[s.id].zone);
        const lastPreIdx = zones.lastIndexOf("pre_history");
        const firstHistIdx = zones.indexOf("history");
        const lastHistIdx = zones.lastIndexOf("history");
        const firstPostIdx = zones.indexOf("post_history");

        if (firstHistIdx === -1 || firstPostIdx === -1) return true; // edge case
        return lastPreIdx < firstHistIdx && lastHistIdx < firstPostIdx;
      }),
      { numRuns: 200 },
    );
  });
});

// ============================================================
// applyMacros — Traditional
// ============================================================

describe("applyMacros", () => {
  test("replaces {{char}} with character name", () => {
    expect(applyMacros("Hello {{char}}", "Alice", "Bob")).toBe("Hello Alice");
  });

  test("replaces {{user}} with user name", () => {
    expect(applyMacros("Hello {{user}}", "Alice", "Bob")).toBe("Hello Bob");
  });

  test("replaces both macros in same string", () => {
    const result = applyMacros("{{char}} talks to {{user}}", "Alice", "Bob");
    expect(result).toBe("Alice talks to Bob");
  });

  test("replaces multiple occurrences", () => {
    const result = applyMacros(
      "{{char}} and {{char}} chat with {{user}} and {{user}}",
      "Alice",
      "Bob",
    );
    expect(result).toBe("Alice and Alice chat with Bob and Bob");
  });

  test("returns original text when no macros present", () => {
    expect(applyMacros("No macros here", "Alice", "Bob")).toBe("No macros here");
  });

  test("handles empty strings", () => {
    expect(applyMacros("", "Alice", "Bob")).toBe("");
    expect(applyMacros("{{char}}", "", "Bob")).toBe("");
    expect(applyMacros("{{user}}", "Alice", "")).toBe("");
  });

  test("applies to the default main prompt correctly", () => {
    const result = applyMacros(DEFAULT_MAIN_PROMPT, "Sato", "Player");
    expect(result).toContain("Sato");
    expect(result).toContain("Player");
    expect(result).not.toContain("{{char}}");
    expect(result).not.toContain("{{user}}");
  });

  test("does not replace partial or malformed macros", () => {
    expect(applyMacros("{{cha}}", "A", "B")).toBe("{{cha}}");
    expect(applyMacros("{char}", "A", "B")).toBe("{char}");
    expect(applyMacros("{{ char }}", "A", "B")).toBe("{{ char }}"); // spaces inside
  });
});

// ============================================================
// applyMacros — Property-Based
// ============================================================

describe("applyMacros — property-based", () => {
  test("idempotent: applying macros twice produces same result", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.string(), (text, char, user) => {
        const once = applyMacros(text, char, user);
        const twice = applyMacros(once, char, user);
        return once === twice;
      }),
      { numRuns: 500 },
    );
  });

  test("result never contains {{char}} or {{user}} macros", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string().filter((s) => !s.includes("{{char}}") && !s.includes("{{user}}")),
        fc.string().filter((s) => !s.includes("{{char}}") && !s.includes("{{user}}")),
        (text, char, user) => {
          const result = applyMacros(text, char, user);
          return !result.includes("{{char}}") && !result.includes("{{user}}");
        },
      ),
      { numRuns: 300 },
    );
  });

  test("text without macros is returned unchanged", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !s.includes("{{char}}") && !s.includes("{{user}}")),
        fc.string(),
        fc.string(),
        (text, char, user) => {
          return applyMacros(text, char, user) === text;
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ============================================================
// parseMesExample — Traditional
// ============================================================

describe("parseMesExample", () => {
  test("returns null for empty string", () => {
    expect(parseMesExample("")).toBeNull();
  });

  test("returns null for whitespace-only string", () => {
    expect(parseMesExample("   \n  \t  ")).toBeNull();
  });

  test("returns null for just <START> tag with no content", () => {
    expect(parseMesExample("<START>")).toBeNull();
    expect(parseMesExample("<START>\n")).toBeNull();
  });

  test("parses a single block", () => {
    const input = "<START>\nUser: Hello\nChar: Hi there!";
    const result = parseMesExample(input);
    expect(result).not.toBeNull();
    expect(result).toContain("[Example Dialogue]");
    expect(result).toContain("User: Hello");
    expect(result).toContain("Char: Hi there!");
  });

  test("parses multiple blocks separated by <START>", () => {
    const input = [
      "<START>",
      "User: First question",
      "Char: First answer",
      "<START>",
      "User: Second question",
      "Char: Second answer",
    ].join("\n");

    const result = parseMesExample(input);
    expect(result).not.toBeNull();
    expect(result).toContain("First question");
    expect(result).toContain("Second answer");
    expect(result).toContain("---"); // Block separator
  });

  test("handles case-insensitive <START> tag", () => {
    const input = "<start>\nUser: hello\nChar: hi";
    const result = parseMesExample(input);
    expect(result).not.toBeNull();
    expect(result).toContain("User: hello");
  });

  test("handles mixed case <START> tags", () => {
    const input = "<Start>\nUser: one\nChar: two\n<START>\nUser: three";
    const result = parseMesExample(input);
    expect(result).not.toBeNull();
    expect(result).toContain("one");
    expect(result).toContain("three");
  });

  test("strips leading/trailing whitespace from blocks", () => {
    const input = "<START>\n  User: trimmed  \n  Char: response  \n";
    const result = parseMesExample(input);
    expect(result).not.toBeNull();
    expect(result).toContain("User: trimmed");
    expect(result).toContain("Char: response");
  });

  test("content without <START> is treated as a single block", () => {
    // No <START> at all — the entire string is one "block" (after split, first element)
    const input = "User: just a message\nChar: a response";
    const result = parseMesExample(input);
    expect(result).not.toBeNull();
    expect(result).toContain("User: just a message");
  });

  test("output always starts with [Example Dialogue]", () => {
    const result = parseMesExample("<START>\nHello\n<START>\nWorld");
    expect(result).not.toBeNull();
    expect(result!.startsWith("[Example Dialogue]")).toBe(true);
  });
});

// ============================================================
// parseMesExample — Property-Based
// ============================================================

describe("parseMesExample — property-based", () => {
  test("never throws for any string input", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        try {
          parseMesExample(input);
          return true;
        } catch {
          return false;
        }
      }),
      { numRuns: 500 },
    );
  });

  test("result is either null or starts with [Example Dialogue]", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = parseMesExample(input);
        return result === null || result.startsWith("[Example Dialogue]");
      }),
      { numRuns: 500 },
    );
  });

  test("non-empty non-whitespace input always produces non-null result", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        (input) => {
          return parseMesExample(input) !== null;
        },
      ),
      { numRuns: 200 },
    );
  });
});
