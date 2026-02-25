import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import fc from "fast-check";
import { runMigrations } from "../server/db/schema.ts";
import {
  getSetting,
  setSetting,
  deleteSetting,
  getSettings,
  getPromptTemplate,
  setPromptTemplate,
} from "../server/db/settings.ts";
import {
  DEFAULT_PROMPT_TEMPLATE,
  type PromptTemplate,
  type SlotId,
} from "../shared/prompt-template.ts";

describe("settings", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
  });

  // ── Basic get/set/delete lifecycle ──────────────────────────

  test("setSetting then getSetting returns the value", () => {
    setSetting(db, "theme", "dark");
    expect(getSetting(db, "theme")).toBe("dark");
  });

  test("getSetting returns null for nonexistent key", () => {
    expect(getSetting(db, "nonexistent")).toBeNull();
  });

  test("setSetting upserts — overwrites existing value", () => {
    setSetting(db, "theme", "light");
    setSetting(db, "theme", "dark");
    expect(getSetting(db, "theme")).toBe("dark");
  });

  test("deleteSetting removes the key", () => {
    setSetting(db, "theme", "dark");
    const deleted = deleteSetting(db, "theme");
    expect(deleted).toBe(true);
    expect(getSetting(db, "theme")).toBeNull();
  });

  test("deleteSetting returns false for nonexistent key", () => {
    expect(deleteSetting(db, "nonexistent")).toBe(false);
  });

  test("setSetting handles empty string value", () => {
    setSetting(db, "empty", "");
    expect(getSetting(db, "empty")).toBe("");
  });

  test("setSetting handles very long values", () => {
    const longValue = "x".repeat(10_000);
    setSetting(db, "long", longValue);
    expect(getSetting(db, "long")).toBe(longValue);
  });

  test("setSetting handles unicode values", () => {
    const unicodeValue = "日本語テスト 🎉 emoji ñ café";
    setSetting(db, "unicode", unicodeValue);
    expect(getSetting(db, "unicode")).toBe(unicodeValue);
  });

  // ── getSettings (multi-key) ─────────────────────────────────

  test("getSettings returns multiple keys", () => {
    setSetting(db, "a", "1");
    setSetting(db, "b", "2");
    setSetting(db, "c", "3");

    const result = getSettings(db, ["a", "b", "c"]);
    expect(result).toEqual({ a: "1", b: "2", c: "3" });
  });

  test("getSettings omits missing keys", () => {
    setSetting(db, "exists", "yes");

    const result = getSettings(db, ["exists", "missing"]);
    expect(result).toEqual({ exists: "yes" });
    expect(result).not.toHaveProperty("missing");
  });

  test("getSettings with empty array returns empty object", () => {
    setSetting(db, "something", "value");
    expect(getSettings(db, [])).toEqual({});
  });

  // ── Prompt template persistence ─────────────────────────────

  test("getPromptTemplate returns default when nothing saved", () => {
    const template = getPromptTemplate(db);
    expect(template.slots).toHaveLength(DEFAULT_PROMPT_TEMPLATE.slots.length);

    const defaultIds = DEFAULT_PROMPT_TEMPLATE.slots.map((s) => s.id);
    const returnedIds = template.slots.map((s) => s.id);
    expect(returnedIds).toEqual(defaultIds);
  });

  test("setPromptTemplate then getPromptTemplate round-trips", () => {
    const custom: PromptTemplate = {
      slots: [
        { id: "main", enabled: true, content: "Custom main prompt" },
        { id: "char_system_prompt", enabled: false },
        { id: "char_description", enabled: true },
        { id: "char_personality", enabled: true },
        { id: "char_scenario", enabled: false },
        { id: "persona", enabled: true },
        { id: "mes_example", enabled: true },
        { id: "history", enabled: true },
        { id: "post_history", enabled: true, content: "Custom post" },
        { id: "assistant_prefill", enabled: true, content: "Sure, I'll" },
      ],
      flattenHistory: true,
    };

    setPromptTemplate(db, custom);
    const retrieved = getPromptTemplate(db);

    expect(retrieved.flattenHistory).toBe(true);
    expect(retrieved.slots.find((s) => s.id === "main")?.content).toBe(
      "Custom main prompt",
    );
    expect(retrieved.slots.find((s) => s.id === "char_system_prompt")?.enabled).toBe(
      false,
    );
    expect(retrieved.slots.find((s) => s.id === "assistant_prefill")?.content).toBe(
      "Sure, I'll",
    );
  });

  test("getPromptTemplate merges missing slots from defaults", () => {
    // Save a template that's missing some slots (simulates an older saved version)
    const partial: PromptTemplate = {
      slots: [
        { id: "main", enabled: true, content: "My prompt" },
        { id: "history", enabled: true },
      ],
    };

    setPromptTemplate(db, partial);
    const retrieved = getPromptTemplate(db);

    // Should have all default slots, not just the two we saved
    const allDefaultIds = DEFAULT_PROMPT_TEMPLATE.slots.map((s) => s.id);
    const retrievedIds = retrieved.slots.map((s) => s.id);
    for (const id of allDefaultIds) {
      expect(retrievedIds).toContain(id);
    }
  });

  test("getPromptTemplate preserves custom slot order for pre_history zone", () => {
    // Save with a reordered pre_history zone
    const reordered: PromptTemplate = {
      slots: [
        { id: "persona", enabled: true }, // normally 6th, moved to 1st
        { id: "main", enabled: true, content: "Reordered" }, // normally 1st
        { id: "char_description", enabled: true },
        { id: "char_system_prompt", enabled: true },
        { id: "char_personality", enabled: true },
        { id: "char_scenario", enabled: true },
        { id: "mes_example", enabled: false },
        { id: "history", enabled: true },
        { id: "post_history", enabled: true },
        { id: "assistant_prefill", enabled: false, content: "" },
      ],
    };

    setPromptTemplate(db, reordered);
    const retrieved = getPromptTemplate(db);

    // First pre_history slot should be persona (our custom order)
    expect(retrieved.slots[0]!.id).toBe("persona");
    expect(retrieved.slots[1]!.id).toBe("main");
  });

  test("getPromptTemplate recovers gracefully from corrupted JSON", () => {
    // Manually write garbage to the settings table
    db.query(
      `INSERT INTO settings (key, value) VALUES ($key, $value)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run({ $key: "prompt_template", $value: "not valid json {{{" });

    const template = getPromptTemplate(db);
    // Should fall back to default
    expect(template.slots).toHaveLength(DEFAULT_PROMPT_TEMPLATE.slots.length);
  });

  // ── fast-check properties ───────────────────────────────────

  test("property: setSetting(k, v) → getSetting(k) === v for arbitrary strings", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.string({ maxLength: 1000 }),
        (key, value) => {
          // Use a fresh DB each iteration to avoid key collisions
          const testDb = new Database(":memory:");
          runMigrations(testDb);

          setSetting(testDb, key, value);
          const retrieved = getSetting(testDb, key);
          expect(retrieved).toBe(value);
        },
      ),
      { numRuns: 200 },
    );
  });

  test("property: setPromptTemplate always produces a template with all default slot IDs", () => {
    const allDefaultIds = DEFAULT_PROMPT_TEMPLATE.slots.map((s) => s.id);
    const slotIdArb = fc.constantFrom(...allDefaultIds);

    // Generate random subsets of slots with random enabled states
    const slotArb = fc.record({
      id: slotIdArb,
      enabled: fc.boolean(),
      content: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
    }) as fc.Arbitrary<{ id: SlotId; enabled: boolean; content?: string }>;

    const templateArb = fc.record({
      slots: fc.uniqueArray(slotArb, {
        minLength: 0,
        maxLength: allDefaultIds.length,
        selector: (s) => s.id,
      }),
      flattenHistory: fc.option(fc.boolean(), { nil: undefined }),
    });

    fc.assert(
      fc.property(templateArb, (template) => {
        const testDb = new Database(":memory:");
        runMigrations(testDb);

        setPromptTemplate(testDb, template as PromptTemplate);
        const retrieved = getPromptTemplate(testDb);

        const retrievedIds = retrieved.slots.map((s) => s.id);
        for (const expectedId of allDefaultIds) {
          expect(retrievedIds).toContain(expectedId);
        }
      }),
      { numRuns: 100 },
    );
  });

  test("property: deleteSetting after setSetting always returns true", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ maxLength: 200 }),
        (key, value) => {
          const testDb = new Database(":memory:");
          runMigrations(testDb);

          setSetting(testDb, key, value);
          expect(deleteSetting(testDb, key)).toBe(true);
          expect(getSetting(testDb, key)).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
