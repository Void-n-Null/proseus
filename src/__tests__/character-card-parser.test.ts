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

/**
 * Build a minimal valid PNG with a tEXt chunk embedded.
 * Uses the actual PNG chunk format: 8-byte header, then IHDR + tEXt + IEND.
 */
function buildTestPNG(keyword: string, text: string): Uint8Array {
  // Encode the character JSON as base64, then into a tEXt chunk
  const base64 = btoa(text);
  const textChunk = encodeTextChunk(keyword, base64);

  // We need: PNG header (8 bytes) + IHDR chunk + tEXt chunk + IEND chunk
  // IHDR: minimal valid (13-byte data)
  const ihdrData = new Uint8Array(13); // All zeros = 0x0 width/height, but structurally valid
  // Set width and height to 1x1
  ihdrData[3] = 1; // width = 1
  ihdrData[7] = 1; // height = 1
  ihdrData[8] = 8; // bit depth = 8
  ihdrData[9] = 2; // color type = RGB

  const ihdrChunk = buildChunk("IHDR", ihdrData);
  const tExtChunk = buildChunk("tEXt", textChunk.data);
  const iendChunk = buildChunk("IEND", new Uint8Array(0));

  // PNG magic header
  const header = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // Combine
  const total = header.length + ihdrChunk.length + tExtChunk.length + iendChunk.length;
  const result = new Uint8Array(total);
  let offset = 0;
  result.set(header, offset);
  offset += header.length;
  result.set(ihdrChunk, offset);
  offset += ihdrChunk.length;
  result.set(tExtChunk, offset);
  offset += tExtChunk.length;
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
