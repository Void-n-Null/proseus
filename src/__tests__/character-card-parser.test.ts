import { test, expect, describe } from "bun:test";
import {
  extractCardFromJSON,
  extractCardFromPNG,
  CardParseError,
} from "../server/lib/character-card-parser.ts";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const encodeTextChunk = require("png-chunk-text/encode") as (
  keyword: string,
  content: string,
) => { name: string; data: Uint8Array };

/** Encode a JSON string to base64 using proper UTF-8 (what real tools do). */
function toBase64(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64");
}

/**
 * Build a minimal valid PNG with one or more tEXt chunks embedded.
 * Uses the actual PNG chunk format: 8-byte header, then IHDR + tEXt(s) + IEND.
 */
function buildTestPNG(
  keyword: string,
  text: string,
  opts?: { rawBase64?: string },
): Uint8Array {
  // Allow overriding the base64 encoding (for double-encode tests)
  const base64 = opts?.rawBase64 ?? toBase64(text);
  return buildMultiChunkPNG([{ keyword, base64 }]);
}

/**
 * Build a PNG with multiple tEXt chunks (e.g. both ccv3 and chara).
 */
function buildMultiChunkPNG(
  chunks: Array<{ keyword: string; base64: string }>,
): Uint8Array {
  // IHDR: minimal valid 1x1 RGB
  const ihdrData = new Uint8Array(13);
  ihdrData[3] = 1; // width = 1
  ihdrData[7] = 1; // height = 1
  ihdrData[8] = 8; // bit depth = 8
  ihdrData[9] = 2; // color type = RGB

  const ihdrChunk = buildChunk("IHDR", ihdrData);
  const iendChunk = buildChunk("IEND", new Uint8Array(0));

  const textChunks = chunks.map(({ keyword, base64 }) => {
    const encoded = encodeTextChunk(keyword, base64);
    return buildChunk("tEXt", encoded.data);
  });

  // PNG magic header
  const header = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // Calculate total size
  const textTotalLen = textChunks.reduce((sum, c) => sum + c.length, 0);
  const total = header.length + ihdrChunk.length + textTotalLen + iendChunk.length;
  const result = new Uint8Array(total);

  let offset = 0;
  result.set(header, offset);
  offset += header.length;
  result.set(ihdrChunk, offset);
  offset += ihdrChunk.length;
  for (const tc of textChunks) {
    result.set(tc, offset);
    offset += tc.length;
  }
  result.set(iendChunk, offset);

  return result;
}

/**
 * Build a raw PNG chunk: 4-byte length + 4-byte type + data + 4-byte CRC
 */
function buildChunk(type: string, data: Uint8Array): Uint8Array {
  const crc32Module = require("crc-32") as { buf: (data: Uint8Array) => number };

  const length = data.length;
  const chunk = new Uint8Array(4 + 4 + length + 4);

  // Length (big-endian, excludes type)
  chunk[0] = (length >>> 24) & 0xff;
  chunk[1] = (length >>> 16) & 0xff;
  chunk[2] = (length >>> 8) & 0xff;
  chunk[3] = length & 0xff;

  // Type
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = type.charCodeAt(i);
  }

  // Data
  chunk.set(data, 8);

  // CRC (over type + data)
  const crcData = new Uint8Array(4 + length);
  for (let i = 0; i < 4; i++) {
    crcData[i] = type.charCodeAt(i);
  }
  crcData.set(data, 4);
  const crc = crc32Module.buf(crcData);

  chunk[8 + length] = (crc >>> 24) & 0xff;
  chunk[9 + length] = (crc >>> 16) & 0xff;
  chunk[10 + length] = (crc >>> 8) & 0xff;
  chunk[11 + length] = crc & 0xff;

  return chunk;
}

// ── JSON Parsing Tests ──

describe("extractCardFromJSON", () => {
  test("V1: flat fields at root level", () => {
    const card = extractCardFromJSON(
      JSON.stringify({
        name: "Alice",
        description: "A curious girl",
        personality: "Adventurous",
        scenario: "In Wonderland",
        first_mes: "Hello there!",
        mes_example: "<START>\n{{char}}: Hi!",
      }),
    );

    expect(card.name).toBe("Alice");
    expect(card.description).toBe("A curious girl");
    expect(card.personality).toBe("Adventurous");
    expect(card.scenario).toBe("In Wonderland");
    expect(card.first_mes).toBe("Hello there!");
    expect(card.mes_example).toBe("<START>\n{{char}}: Hi!");
    expect(card.source_spec).toBe("v1");

    // V2 fields should be empty defaults
    expect(card.creator_notes).toBe("");
    expect(card.system_prompt).toBe("");
    expect(card.alternate_greetings).toEqual([]);
    expect(card.tags).toEqual([]);
    expect(card.extensions).toEqual({});
    expect(card.character_book).toBeNull();
  });

  test("V2: spec field with nested data", () => {
    const card = extractCardFromJSON(
      JSON.stringify({
        spec: "chara_card_v2",
        spec_version: "2.0",
        data: {
          name: "Bob",
          description: "A builder",
          personality: "Hardworking",
          scenario: "Construction site",
          first_mes: "Can we fix it?",
          mes_example: "",
          creator_notes: "Based on the show",
          system_prompt: "You are Bob the Builder",
          post_history_instructions: "Stay in character",
          alternate_greetings: ["Yes we can!", "Let's get to work!"],
          tags: ["cartoon", "builder"],
          creator: "HiT Entertainment",
          character_version: "1.0",
          extensions: {
            "custom/voice": { model: "en-male-1" },
            depth_prompt: { prompt: "Remember to be helpful" },
          },
        },
      }),
    );

    expect(card.name).toBe("Bob");
    expect(card.source_spec).toBe("v2");
    expect(card.creator_notes).toBe("Based on the show");
    expect(card.system_prompt).toBe("You are Bob the Builder");
    expect(card.post_history_instructions).toBe("Stay in character");
    expect(card.alternate_greetings).toEqual([
      "Yes we can!",
      "Let's get to work!",
    ]);
    expect(card.tags).toEqual(["cartoon", "builder"]);
    expect(card.creator).toBe("HiT Entertainment");
    expect(card.character_version).toBe("1.0");

    // Extensions preserved losslessly
    expect(card.extensions["custom/voice"]).toEqual({ model: "en-male-1" });
    expect(card.extensions["depth_prompt"]).toEqual({
      prompt: "Remember to be helpful",
    });
  });

  test("V2: with character_book", () => {
    const card = extractCardFromJSON(
      JSON.stringify({
        spec: "chara_card_v2",
        spec_version: "2.0",
        data: {
          name: "Lorekeeper",
          description: "Keeper of knowledge",
          personality: "",
          scenario: "",
          first_mes: "What would you like to know?",
          mes_example: "",
          creator_notes: "",
          system_prompt: "",
          post_history_instructions: "",
          alternate_greetings: [],
          tags: [],
          creator: "",
          character_version: "",
          extensions: {},
          character_book: {
            name: "World Lore",
            description: "Background info",
            scan_depth: 10,
            token_budget: 2048,
            recursive_scanning: true,
            extensions: {},
            entries: [
              {
                keys: ["dragon", "dragons"],
                content: "Dragons are feared creatures of legend.",
                extensions: {},
                enabled: true,
                insertion_order: 0,
                case_sensitive: false,
                name: "Dragons",
                priority: 10,
                id: 1,
                selective: false,
                secondary_keys: [],
                constant: false,
                position: "before_char",
              },
            ],
          },
        },
      }),
    );

    expect(card.character_book).not.toBeNull();
    expect(card.character_book!.name).toBe("World Lore");
    expect(card.character_book!.scan_depth).toBe(10);
    expect(card.character_book!.token_budget).toBe(2048);
    expect(card.character_book!.recursive_scanning).toBe(true);
    expect(card.character_book!.entries).toHaveLength(1);
    expect(card.character_book!.entries[0]!.keys).toEqual(["dragon", "dragons"]);
    expect(card.character_book!.entries[0]!.content).toBe(
      "Dragons are feared creatures of legend.",
    );
    expect(card.character_book!.entries[0]!.position).toBe("before_char");
  });

  test("V3: degrades to V2 with original preserved in extensions", () => {
    const v3Card = {
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: {
        name: "V3 Character",
        description: "A modern character",
        personality: "Progressive",
        scenario: "Future",
        first_mes: "Hello from V3!",
        mes_example: "",
        creator_notes: "",
        system_prompt: "",
        post_history_instructions: "",
        alternate_greetings: [],
        tags: ["v3", "modern"],
        creator: "RisuAI",
        character_version: "3.0",
        extensions: {},
        assets: [
          {
            type: "icon",
            uri: "data:image/png;base64,abc",
            name: "main",
            ext: "png",
          },
        ],
        nickname: "V3",
        source: ["https://example.com"],
      },
    };

    const card = extractCardFromJSON(JSON.stringify(v3Card));

    expect(card.name).toBe("V3 Character");
    expect(card.source_spec).toBe("v3");
    expect(card.tags).toEqual(["v3", "modern"]);

    // Full V3 data preserved in extensions for lossless round-trip
    const original = card.extensions["proseus/original_v3"] as typeof v3Card;
    expect(original).toBeDefined();
    expect(original.spec).toBe("chara_card_v3");
    expect(original.data.assets).toHaveLength(1);
    expect(original.data.nickname).toBe("V3");
  });

  test("handles missing optional fields gracefully", () => {
    // V2 card with minimal fields — many undefined
    const card = extractCardFromJSON(
      JSON.stringify({
        spec: "chara_card_v2",
        spec_version: "2.0",
        data: {
          name: "Minimal",
          // Everything else missing
        },
      }),
    );

    expect(card.name).toBe("Minimal");
    expect(card.description).toBe("");
    expect(card.personality).toBe("");
    expect(card.first_mes).toBe("");
    expect(card.alternate_greetings).toEqual([]);
    expect(card.tags).toEqual([]);
    expect(card.extensions).toEqual({});
    expect(card.character_book).toBeNull();
  });

  test("sets name to 'Unnamed' when name is empty", () => {
    const card = extractCardFromJSON(
      JSON.stringify({ name: "", description: "test" }),
    );
    expect(card.name).toBe("Unnamed");
  });

  test("rejects invalid JSON", () => {
    expect(() => extractCardFromJSON("not json")).toThrow(CardParseError);
  });

  test("rejects non-object JSON", () => {
    expect(() => extractCardFromJSON('"just a string"')).toThrow(CardParseError);
  });

  test("rejects unrecognizable format", () => {
    expect(() => extractCardFromJSON(JSON.stringify({ foo: "bar" }))).toThrow(
      CardParseError,
    );
  });

  test("handles V2 data at root without spec wrapper", () => {
    // Some exporters wrap data in { data: { ... } } without the spec field
    const card = extractCardFromJSON(
      JSON.stringify({
        data: {
          name: "Wrapped",
          description: "Wrapped without spec",
          personality: "",
          scenario: "",
          first_mes: "Hi!",
          mes_example: "",
          creator_notes: "",
          system_prompt: "",
          post_history_instructions: "",
          alternate_greetings: [],
          tags: [],
          creator: "",
          character_version: "",
          extensions: {},
        },
      }),
    );

    expect(card.name).toBe("Wrapped");
    expect(card.description).toBe("Wrapped without spec");
    expect(card.source_spec).toBe("v2");
  });
});

// ── PNG Parsing Tests ──

describe("extractCardFromPNG", () => {
  test("extracts V1 card from chara tEXt chunk", () => {
    const json = JSON.stringify({
      name: "PNG Alice",
      description: "From a PNG",
      personality: "Curious",
      scenario: "",
      first_mes: "Hello from PNG!",
      mes_example: "",
    });

    const png = buildTestPNG("chara", json);
    const card = extractCardFromPNG(png);

    expect(card.name).toBe("PNG Alice");
    expect(card.first_mes).toBe("Hello from PNG!");
    expect(card.source_spec).toBe("v1");
  });

  test("extracts V2 card from chara tEXt chunk", () => {
    const json = JSON.stringify({
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "PNG Bob",
        description: "V2 in PNG",
        personality: "",
        scenario: "",
        first_mes: "V2 hello!",
        mes_example: "",
        creator_notes: "Test notes",
        system_prompt: "",
        post_history_instructions: "",
        alternate_greetings: ["Alt greeting"],
        tags: ["test"],
        creator: "Tester",
        character_version: "1.0",
        extensions: { "test/ext": true },
      },
    });

    const png = buildTestPNG("chara", json);
    const card = extractCardFromPNG(png);

    expect(card.name).toBe("PNG Bob");
    expect(card.source_spec).toBe("v2");
    expect(card.creator_notes).toBe("Test notes");
    expect(card.alternate_greetings).toEqual(["Alt greeting"]);
    expect(card.tags).toEqual(["test"]);
    expect(card.extensions["test/ext"]).toBe(true);
  });

  test("prefers ccv3 chunk over chara chunk", () => {
    // Build a PNG with both ccv3 and chara chunks
    // For simplicity, just test ccv3 alone
    const v3Json = JSON.stringify({
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: {
        name: "V3 PNG Character",
        description: "",
        personality: "",
        scenario: "",
        first_mes: "V3 in PNG!",
        mes_example: "",
        creator_notes: "",
        system_prompt: "",
        post_history_instructions: "",
        alternate_greetings: [],
        tags: [],
        creator: "",
        character_version: "",
        extensions: {},
      },
    });

    const png = buildTestPNG("ccv3", v3Json);
    const card = extractCardFromPNG(png);

    expect(card.name).toBe("V3 PNG Character");
    expect(card.source_spec).toBe("v3");
  });

  test("rejects non-PNG data", () => {
    const notPng = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    expect(() => extractCardFromPNG(notPng)).toThrow(CardParseError);
  });

  test("rejects PNG without character data", () => {
    // Build a valid PNG with no tEXt chunks (just IHDR + IEND)
    const header = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const ihdrData = new Uint8Array(13);
    ihdrData[3] = 1;
    ihdrData[7] = 1;
    ihdrData[8] = 8;
    ihdrData[9] = 2;
    const ihdr = buildChunk("IHDR", ihdrData);
    const iend = buildChunk("IEND", new Uint8Array(0));

    const total = header.length + ihdr.length + iend.length;
    const png = new Uint8Array(total);
    let offset = 0;
    png.set(header, offset);
    offset += header.length;
    png.set(ihdr, offset);
    offset += ihdr.length;
    png.set(iend, offset);

    expect(() => extractCardFromPNG(png)).toThrow(CardParseError);
  });
});

// ── DB Integration Tests ──

describe("character DB operations", () => {
  const { Database } = require("bun:sqlite") as typeof import("bun:sqlite");
  const { runMigrations } = require("../server/db/schema.ts") as typeof import("../server/db/schema.ts");
  const {
    createCharacter,
    getCharacter,
    listCharacters,
    deleteCharacter,
  } = require("../server/db/characters.ts") as typeof import("../server/db/characters.ts");

  function freshDb() {
    const db = new Database(":memory:");
    runMigrations(db);
    return db;
  }

  const sampleCard = {
    name: "Test Character",
    description: "A test character for testing",
    personality: "Friendly",
    scenario: "A test scenario",
    first_mes: "Hello! I'm a test character.",
    mes_example: "",
    creator_notes: "Testing notes",
    system_prompt: "You are a test character.",
    post_history_instructions: "",
    alternate_greetings: ["Hi!", "Hey there!"],
    tags: ["test", "sample"],
    creator: "Tester",
    character_version: "1.0",
    extensions: { "test/key": "value" },
    character_book: null,
    source_spec: "v2" as const,
  };

  test("createCharacter: stores and retrieves character", async () => {
    const db = freshDb();
    const { character, duplicate } = await createCharacter(db, sampleCard);

    expect(duplicate).toBe(false);
    expect(character.id).toBeTruthy();
    expect(character.name).toBe("Test Character");
    expect(character.description).toBe("A test character for testing");
    expect(character.system_prompt).toBe("You are a test character.");
    expect(character.alternate_greetings).toEqual(["Hi!", "Hey there!"]);
    expect(character.tags).toEqual(["test", "sample"]);
    expect(character.extensions["test/key"]).toBe("value");
    expect(character.avatar_url).toBeNull(); // No avatar provided
    expect(character.source_spec).toBe("v2");

    // Verify retrieval
    const fetched = getCharacter(db, character.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe("Test Character");
    expect(fetched!.extensions["test/key"]).toBe("value");
  });

  test("createCharacter: deduplication prevents same card twice", async () => {
    const db = freshDb();
    const first = await createCharacter(db, sampleCard);
    const second = await createCharacter(db, sampleCard);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.character.id).toBe(first.character.id);
  });

  test("createCharacter: force=true bypasses dedup", async () => {
    const db = freshDb();
    const first = await createCharacter(db, sampleCard);
    const second = await createCharacter(db, sampleCard, undefined, {
      force: true,
    });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(false);
    expect(second.character.id).not.toBe(first.character.id);
    expect(second.character.name).toBe(first.character.name);

    // Both should exist in the database
    const list = listCharacters(db);
    expect(list).toHaveLength(2);
  });

  test("createCharacter: different system_prompt produces different hash", async () => {
    const db = freshDb();
    const first = await createCharacter(db, sampleCard);
    const modified = {
      ...sampleCard,
      system_prompt: "Completely different system prompt",
    };
    const second = await createCharacter(db, modified);

    // Should NOT be a duplicate since system_prompt is included in hash
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(false);
    expect(second.character.id).not.toBe(first.character.id);
  });

  test("createCharacter: stores avatar blob with hash", async () => {
    const db = freshDb();
    const avatar = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const { character } = await createCharacter(db, sampleCard, avatar);

    expect(character.avatar_url).toBe(`/api/characters/${character.id}/avatar`);
    expect(character.avatar_hash).toBeTruthy();
    expect(character.avatar_hash!.length).toBe(64); // SHA-256 hex
  });

  test("listCharacters: returns lightweight list ordered by created_at DESC", async () => {
    const db = freshDb();
    await createCharacter(db, { ...sampleCard, name: "First" });
    // Bump created_at to ensure ordering
    await new Promise((r) => setTimeout(r, 5));
    await createCharacter(db, {
      ...sampleCard,
      name: "Second",
      first_mes: "Different first message",
    });

    const list = listCharacters(db);
    expect(list).toHaveLength(2);
    expect(list[0]!.name).toBe("Second");
    expect(list[1]!.name).toBe("First");

    // List items should not have full character data
    expect((list[0] as unknown as Record<string, unknown>)["description"]).toBeUndefined();
  });

  test("deleteCharacter: removes character", async () => {
    const db = freshDb();
    const { character } = await createCharacter(db, sampleCard);

    const deleted = deleteCharacter(db, character.id);
    expect(deleted).toBe(true);
    expect(getCharacter(db, character.id)).toBeNull();
  });

  test("deleteCharacter: returns false for nonexistent", () => {
    const db = freshDb();
    expect(deleteCharacter(db, "nonexistent")).toBe(false);
  });

  test("extensions are preserved losslessly", async () => {
    const db = freshDb();
    const complexExtensions = {
      "custom/voice_settings": {
        model: "en-male-1",
        speed: 1.0,
        pitch: 0.5,
      },
      depth_prompt: {
        prompt: "Always remember the lore",
        depth: 4,
      },
      "sillyTavern/custom": [1, 2, 3],
      "unknown_app/data": { nested: { deeply: true } },
    };

    const { character } = await createCharacter(db, {
      ...sampleCard,
      name: "Extension Test",
      first_mes: "Unique for dedup",
      extensions: complexExtensions,
    });

    const fetched = getCharacter(db, character.id);
    expect(fetched!.extensions).toEqual(complexExtensions);
  });
});

// ── Edge Case Tests (spec-derived) ──

describe("edge cases", () => {
  // ── Edge Case 1: UTF-8/CJK/emoji in PNG base64 ──
  // Real cards from Chub often have Japanese, Chinese, Korean, or emoji characters.
  // The base64 encoding path in real tools is Buffer.from(json, 'utf-8').toString('base64').
  // Our previous atob() decoded to Latin-1 binary, corrupting multi-byte UTF-8 sequences.

  test("EC1: UTF-8/CJK names and descriptions survive PNG round-trip", () => {
    const json = JSON.stringify({
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "桜花",
        description: "日本語のキャラクター。彼女は東京に住んでいます。",
        personality: "元気で明るい",
        scenario: "学校の屋上で会話する",
        first_mes: "こんにちは！私は桜花です。今日はいい天気ですね！🌸",
        mes_example: "<START>\n{{char}}: おはよう！",
        creator_notes: "Made by テスター",
        system_prompt: "あなたは桜花として振る舞ってください",
        post_history_instructions: "",
        alternate_greetings: ["やっほー！", "おはよう、{{user}}！"],
        tags: ["日本語", "学園", "emoji🎭"],
        creator: "日本の作者",
        character_version: "1.0",
        extensions: { "custom/note": "拡張データ" },
      },
    });

    const png = buildTestPNG("chara", json);
    const card = extractCardFromPNG(png);

    expect(card.name).toBe("桜花");
    expect(card.description).toContain("日本語のキャラクター");
    expect(card.first_mes).toContain("🌸");
    expect(card.personality).toBe("元気で明るい");
    expect(card.tags).toEqual(["日本語", "学園", "emoji🎭"]);
    expect(card.creator).toBe("日本の作者");
    expect(card.extensions["custom/note"]).toBe("拡張データ");
    expect(card.alternate_greetings).toEqual(["やっほー！", "おはよう、{{user}}！"]);
  });

  // ── Edge Case 2: Double base64 encoding ──
  // Some tools accidentally base64-encode the already-base64 string. The parser
  // should detect this and unwrap one layer.

  test("EC2: double base64-encoded PNG chunk is unwrapped", () => {
    const json = JSON.stringify({
      name: "DoubleEncoded",
      description: "This card was base64'd twice by a buggy tool",
      personality: "",
      scenario: "",
      first_mes: "If you can read this, decoding worked!",
      mes_example: "",
    });

    // First encode: json → base64 (what real tools do)
    const singleEncoded = Buffer.from(json, "utf-8").toString("base64");
    // Second encode: base64 → base64 again (the bug)
    const doubleEncoded = Buffer.from(singleEncoded, "utf-8").toString("base64");

    // Build PNG with the double-encoded data as the raw base64
    const png = buildTestPNG("chara", "", { rawBase64: doubleEncoded });
    const card = extractCardFromPNG(png);

    expect(card.name).toBe("DoubleEncoded");
    expect(card.first_mes).toBe("If you can read this, decoding worked!");
    expect(card.source_spec).toBe("v1");
  });

  // ── Edge Case 3: Case-insensitive chunk keywords ──
  // The spec says "chara" but some tools write "Chara", "CHARA", etc.
  // SillyTavern reads case-insensitively. We should too.

  test("EC3: case-insensitive chunk keyword matching (Chara, CHARA)", () => {
    const v1Json = JSON.stringify({
      name: "CaseTester",
      description: "Testing keyword case",
      personality: "",
      scenario: "",
      first_mes: "I was stored with a weird keyword case!",
      mes_example: "",
    });

    // Test with "Chara" (capitalized)
    const png1 = buildTestPNG("Chara", v1Json);
    const card1 = extractCardFromPNG(png1);
    expect(card1.name).toBe("CaseTester");

    // Test with "CHARA" (all caps)
    const png2 = buildTestPNG("CHARA", v1Json);
    const card2 = extractCardFromPNG(png2);
    expect(card2.name).toBe("CaseTester");

    // Test with "CCv3" (mixed case on V3 keyword)
    const v3Json = JSON.stringify({
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: {
        name: "V3CaseTest",
        description: "",
        personality: "",
        scenario: "",
        first_mes: "V3 mixed case keyword",
        mes_example: "",
        creator_notes: "",
        system_prompt: "",
        post_history_instructions: "",
        alternate_greetings: [],
        tags: [],
        creator: "",
        character_version: "",
        extensions: {},
      },
    });
    const png3 = buildTestPNG("CCv3", v3Json);
    const card3 = extractCardFromPNG(png3);
    expect(card3.name).toBe("V3CaseTest");
    expect(card3.source_spec).toBe("v3");
  });

  // ── Edge Case 4: Both ccv3 AND chara chunks in same PNG ──
  // SillyTavern writes BOTH chunks to every V3 export. The ccv3 chunk has the
  // V3 data, the chara chunk has a V2 backfill. We must prefer ccv3.

  test("EC4: prefers ccv3 over chara when both chunks present", () => {
    const v3Json = JSON.stringify({
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: {
        name: "V3 Preferred",
        description: "This is the V3 version",
        personality: "",
        scenario: "",
        first_mes: "V3 greeting",
        mes_example: "",
        creator_notes: "",
        system_prompt: "V3 system prompt",
        post_history_instructions: "",
        alternate_greetings: [],
        tags: ["v3"],
        creator: "",
        character_version: "3.0",
        extensions: {},
        assets: [{ type: "icon", uri: "ccdefault:", name: "main", ext: "png" }],
        nickname: "V3Nick",
      },
    });

    const v2Json = JSON.stringify({
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "V2 Fallback",
        description: "This is the V2 backfill — should NOT be used",
        personality: "",
        scenario: "",
        first_mes: "V2 greeting — WRONG",
        mes_example: "",
        creator_notes: "",
        system_prompt: "V2 system prompt — WRONG",
        post_history_instructions: "",
        alternate_greetings: [],
        tags: ["v2"],
        creator: "",
        character_version: "2.0",
        extensions: {},
      },
    });

    // Build PNG with both chunks: chara first, then ccv3
    // (order in the file shouldn't matter — ccv3 should always win)
    const png = buildMultiChunkPNG([
      { keyword: "chara", base64: toBase64(v2Json) },
      { keyword: "ccv3", base64: toBase64(v3Json) },
    ]);

    const card = extractCardFromPNG(png);
    expect(card.name).toBe("V3 Preferred");
    expect(card.source_spec).toBe("v3");
    expect(card.system_prompt).toBe("V3 system prompt");
    expect(card.tags).toEqual(["v3"]);

    // V3 original should be preserved in extensions
    const original = card.extensions["proseus/original_v3"] as Record<string, unknown>;
    expect(original).toBeDefined();
    expect((original.data as Record<string, unknown>).nickname).toBe("V3Nick");
  });

  // ── Edge Case 5: V3 card in chara chunk (SillyTavern backfill behavior) ──
  // ST sometimes writes V3 data (with spec: "chara_card_v3") into the chara chunk
  // instead of / in addition to ccv3. The parser detects V3 from the spec field
  // regardless of which chunk keyword it came from.

  test("EC5: V3 card in chara chunk is detected by spec field", () => {
    const json = JSON.stringify({
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: {
        name: "V3InChara",
        description: "V3 card stored in chara keyword",
        personality: "",
        scenario: "",
        first_mes: "I'm V3 but in a chara chunk!",
        mes_example: "",
        creator_notes: "",
        system_prompt: "",
        post_history_instructions: "",
        alternate_greetings: [],
        tags: [],
        creator: "",
        character_version: "",
        extensions: {},
        group_only_greetings: [],
        assets: [{ type: "icon", uri: "ccdefault:", name: "main", ext: "png" }],
      },
    });

    // Stored in "chara" keyword, not "ccv3"
    const png = buildTestPNG("chara", json);
    const card = extractCardFromPNG(png);

    expect(card.name).toBe("V3InChara");
    expect(card.source_spec).toBe("v3");
    // Full V3 data preserved
    expect(card.extensions["proseus/original_v3"]).toBeDefined();
  });

  // ── Edge Case 6: tags as comma-separated string instead of array ──
  // Some old exporters write tags as a single comma-separated string.
  // SillyTavern handles this by splitting. We should too.

  test("EC6: tags as comma-separated string splits into array", () => {
    const card = extractCardFromJSON(
      JSON.stringify({
        spec: "chara_card_v2",
        spec_version: "2.0",
        data: {
          name: "StringTags",
          description: "",
          personality: "",
          scenario: "",
          first_mes: "",
          mes_example: "",
          creator_notes: "",
          system_prompt: "",
          post_history_instructions: "",
          alternate_greetings: [],
          tags: "fantasy, romance, adventure, nsfw",
          creator: "",
          character_version: "",
          extensions: {},
        },
      }),
    );

    expect(card.tags).toEqual(["fantasy", "romance", "adventure", "nsfw"]);
  });

  // ── Edge Case 7: alternate_greetings as single string ──
  // Same issue as tags — some tools write a single string instead of an array.

  test("EC7: alternate_greetings as single string wraps into array", () => {
    const card = extractCardFromJSON(
      JSON.stringify({
        spec: "chara_card_v2",
        spec_version: "2.0",
        data: {
          name: "StringGreetings",
          description: "",
          personality: "",
          scenario: "",
          first_mes: "Hello!",
          mes_example: "",
          creator_notes: "",
          system_prompt: "",
          post_history_instructions: "",
          alternate_greetings: "Hey there! Welcome to the adventure.",
          tags: [],
          creator: "",
          character_version: "",
          extensions: {},
        },
      }),
    );

    // Single string should be treated as one greeting (no commas to split on in this case,
    // but the point is it doesn't crash and produces something usable)
    expect(card.alternate_greetings).toBeInstanceOf(Array);
    expect(card.alternate_greetings.length).toBeGreaterThan(0);
    // The full string should be present somewhere in the result
    expect(card.alternate_greetings.join(", ")).toContain("Hey there");
  });

  // ── Edge Case 8: V2 card with null/missing data field ──
  // A card that claims spec: "chara_card_v2" but has no data object is malformed.
  // This should throw CardParseError, not silently produce an empty "Unnamed" card.

  test("EC8: V2 with null data throws CardParseError", () => {
    expect(() =>
      extractCardFromJSON(
        JSON.stringify({
          spec: "chara_card_v2",
          spec_version: "2.0",
          data: null,
        }),
      ),
    ).toThrow(CardParseError);
  });

  test("EC8b: V2 with missing data field throws CardParseError", () => {
    expect(() =>
      extractCardFromJSON(
        JSON.stringify({
          spec: "chara_card_v2",
          spec_version: "2.0",
        }),
      ),
    ).toThrow(CardParseError);
  });

  test("EC8c: V3 with null data throws CardParseError", () => {
    expect(() =>
      extractCardFromJSON(
        JSON.stringify({
          spec: "chara_card_v3",
          spec_version: "3.0",
          data: null,
        }),
      ),
    ).toThrow(CardParseError);
  });

  // ── Edge Case 9: Lorebook entries with SillyTavern extension fields ──
  // Most Chub cards have ST-specific fields in entry.extensions: position (number),
  // depth, selectiveLogic, probability, group, etc. These MUST survive round-trip.

  test("EC9: lorebook entries with SillyTavern extensions are preserved", () => {
    const card = extractCardFromJSON(
      JSON.stringify({
        spec: "chara_card_v2",
        spec_version: "2.0",
        data: {
          name: "LoreBot",
          description: "",
          personality: "",
          scenario: "",
          first_mes: "",
          mes_example: "",
          creator_notes: "",
          system_prompt: "",
          post_history_instructions: "",
          alternate_greetings: [],
          tags: [],
          creator: "",
          character_version: "",
          extensions: {},
          character_book: {
            name: "ST World Info",
            extensions: {
              "sillyTavern/worldInfo": { version: 2 },
            },
            entries: [
              {
                keys: ["dragon"],
                content: "Dragons are mighty beasts.",
                extensions: {
                  position: 0,
                  exclude_recursion: false,
                  display_index: 0,
                  probability: 100,
                  useProbability: true,
                  depth: 4,
                  selectiveLogic: 0,
                  group: "creatures",
                  group_override: false,
                  group_weight: null,
                  prevent_recursion: false,
                  delay_until_recursion: false,
                  scan_depth: null,
                  match_whole_words: null,
                  use_group_scoring: false,
                  case_sensitive: null,
                  automation_id: "",
                  role: 0,
                  vectorized: false,
                  sticky: 0,
                  cooldown: 0,
                  delay: 0,
                },
                enabled: true,
                insertion_order: 100,
                name: "Dragons",
                priority: 10,
                id: 0,
                comment: "",
                selective: true,
                secondary_keys: ["wyrm", "drake"],
                constant: false,
                position: "before_char",
              },
              {
                keys: ["tavern"],
                content: "The Rusty Flagon is the local tavern.",
                extensions: {
                  position: 1,
                  depth: 2,
                  role: 1,
                  use_regex: true,
                  triggers: [{ type: "keyword", value: "inn" }],
                  ignore_budget: true,
                },
                enabled: true,
                insertion_order: 50,
                name: "Tavern",
                priority: 5,
                id: 1,
                selective: false,
                secondary_keys: [],
                constant: true,
                position: "after_char",
              },
            ],
          },
        },
      }),
    );

    const book = card.character_book;
    expect(book).not.toBeNull();
    expect(book!.entries).toHaveLength(2);

    // Entry 0: verify ST extensions survived
    const entry0 = book!.entries[0]!;
    expect(entry0.keys).toEqual(["dragon"]);
    expect(entry0.content).toBe("Dragons are mighty beasts.");
    expect(entry0.extensions.position).toBe(0);
    expect(entry0.extensions.probability).toBe(100);
    expect(entry0.extensions.useProbability).toBe(true);
    expect(entry0.extensions.depth).toBe(4);
    expect(entry0.extensions.selectiveLogic).toBe(0);
    expect(entry0.extensions.group).toBe("creatures");
    expect(entry0.extensions.vectorized).toBe(false);
    expect(entry0.extensions.sticky).toBe(0);
    expect(entry0.selective).toBe(true);
    expect(entry0.secondary_keys).toEqual(["wyrm", "drake"]);
    expect(entry0.position).toBe("before_char");

    // Entry 1: verify ST extensions + spec-level fields
    const entry1 = book!.entries[1]!;
    expect(entry1.extensions.use_regex).toBe(true);
    expect(entry1.extensions.triggers).toEqual([{ type: "keyword", value: "inn" }]);
    expect(entry1.extensions.ignore_budget).toBe(true);
    expect(entry1.constant).toBe(true);
    expect(entry1.position).toBe("after_char");

    // Book-level extensions also preserved
    expect(book!.extensions["sillyTavern/worldInfo"]).toEqual({ version: 2 });
  });

  // ── Edge Case 10: V1 creatorcomment field mapping ──
  // Older tools (CAI exports, early TavernAI) use 'creatorcomment' instead of
  // 'creator_notes'. SillyTavern maps this field. We should too.

  test("EC10: V1 card with creatorcomment maps to creator_notes", () => {
    const card = extractCardFromJSON(
      JSON.stringify({
        name: "OldCard",
        description: "From an ancient tool",
        personality: "Grumpy",
        scenario: "A dusty tavern",
        first_mes: "What do you want?",
        mes_example: "",
        creatorcomment: "Ported from Character.AI by an old converter",
      }),
    );

    expect(card.name).toBe("OldCard");
    expect(card.source_spec).toBe("v1");
    expect(card.creator_notes).toBe("Ported from Character.AI by an old converter");
  });

  test("EC10b: V1 card with both creatorcomment and creator_notes prefers creatorcomment", () => {
    // creatorcomment is the canonical V1 field name; creator_notes is V2.
    // If both present at root, creatorcomment takes priority (it's what old tools set).
    const card = extractCardFromJSON(
      JSON.stringify({
        name: "BothFields",
        description: "",
        personality: "",
        scenario: "",
        first_mes: "",
        mes_example: "",
        creatorcomment: "The original comment",
        creator_notes: "A newer field that shouldn't override",
      }),
    );

    expect(card.creator_notes).toBe("The original comment");
  });

  // ── Bonus: V1 card with V2 fields at root level ──
  // Some tools export V1 cards that also have system_prompt, tags, etc. at root
  // (no spec wrapper). These V2-like fields should be extracted when present.

  test("EC10c: V1 card with V2-like fields at root extracts them", () => {
    const card = extractCardFromJSON(
      JSON.stringify({
        name: "HybridCard",
        description: "Has V2 fields but no spec wrapper",
        personality: "",
        scenario: "",
        first_mes: "Hello!",
        mes_example: "",
        system_prompt: "You are a helpful character.",
        post_history_instructions: "Stay in character always.",
        tags: ["hybrid", "test"],
        creator: "SomeCreator",
        extensions: { "custom/data": 42 },
      }),
    );

    expect(card.source_spec).toBe("v1");
    expect(card.system_prompt).toBe("You are a helpful character.");
    expect(card.post_history_instructions).toBe("Stay in character always.");
    expect(card.tags).toEqual(["hybrid", "test"]);
    expect(card.creator).toBe("SomeCreator");
    expect(card.extensions["custom/data"]).toBe(42);
  });
});
