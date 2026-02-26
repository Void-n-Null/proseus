import { test, expect, describe, beforeEach } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { runMigrations } from "../server/db/schema.ts";
import { createCharactersRouter } from "../server/routes/characters.ts";
import { createPersonasRouter } from "../server/routes/personas.ts";
import { createCharacter } from "../server/db/characters.ts";
import { createPersona } from "../server/db/personas.ts";
import {
  validateUpload,
  isValidImageMime,
  MAX_AVATAR_SIZE,
  MAX_CARD_IMPORT_SIZE,
} from "../server/lib/upload.ts";
import type { NormalizedCard } from "../server/lib/character-card-parser.ts";

// ── Helpers ──

/** Create a File with a specific size (filled with zeroes). */
function fakeFile(sizeBytes: number, type: string, name = "test"): File {
  const buffer = new ArrayBuffer(sizeBytes);
  return new File([buffer], name, { type });
}

/** Minimal valid PNG: 8-byte header + IHDR + IEND (67 bytes). */
function minimalPNG(): Uint8Array {
  // prettier-ignore
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, // IHDR length
    0x49, 0x48, 0x44, 0x52, // "IHDR"
    0x00, 0x00, 0x00, 0x01, // width: 1
    0x00, 0x00, 0x00, 0x01, // height: 1
    0x08, 0x02,             // bit depth: 8, color type: RGB
    0x00, 0x00, 0x00,       // compression, filter, interlace
    0x90, 0x77, 0x53, 0xde, // CRC
    0x00, 0x00, 0x00, 0x0c, // IDAT length
    0x49, 0x44, 0x41, 0x54, // "IDAT"
    0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, // deflated data
    0x00, 0x02, 0x00, 0x01, // CRC (approximate)
    0xe2, 0x21, 0xbc, 0x33, // CRC
    0x00, 0x00, 0x00, 0x00, // IEND length
    0x49, 0x45, 0x4e, 0x44, // "IEND"
    0xae, 0x42, 0x60, 0x82, // CRC
  ]);
}

function multipartUpload(
  file: File,
): { method: string; body: FormData } {
  const form = new FormData();
  form.set("file", file);
  return { method: "POST", body: form };
}

function createTestApp(db: Database): Hono {
  const app = new Hono().basePath("/api");
  app.route("/characters", createCharactersRouter(db));
  app.route("/personas", createPersonasRouter(db));
  return app;
}

const STUB_CARD: NormalizedCard = {
  name: "Test Character",
  description: "A test character",
  personality: "",
  scenario: "",
  first_mes: "Hello!",
  mes_example: "",
  creator_notes: "",
  system_prompt: "",
  post_history_instructions: "",
  alternate_greetings: [],
  tags: [],
  creator: "",
  character_version: "",
  source_spec: "v2",
  extensions: {},
  character_book: null,
};

// ── Unit tests for validateUpload ──

describe("validateUpload", () => {
  test("returns null for file within size limit", () => {
    const file = fakeFile(1024, "image/png");
    expect(validateUpload(file, MAX_AVATAR_SIZE)).toBeNull();
  });

  test("returns null for file exactly at size limit", () => {
    const file = fakeFile(MAX_AVATAR_SIZE, "image/png");
    expect(validateUpload(file, MAX_AVATAR_SIZE)).toBeNull();
  });

  test("returns error for file exceeding size limit", () => {
    const file = fakeFile(MAX_AVATAR_SIZE + 1, "image/png");
    const error = validateUpload(file, MAX_AVATAR_SIZE);
    expect(error).toContain("File too large");
    expect(error).toContain("50 MB");
  });

  test("returns error message with correct limit for card imports", () => {
    const file = fakeFile(MAX_CARD_IMPORT_SIZE + 1, "application/octet-stream");
    const error = validateUpload(file, MAX_CARD_IMPORT_SIZE);
    expect(error).toContain("70 MB");
  });

  test("returns null for valid MIME when checkMime is true", () => {
    const file = fakeFile(1024, "image/png");
    expect(validateUpload(file, MAX_AVATAR_SIZE, { checkMime: true })).toBeNull();
  });

  test("returns error for invalid MIME when checkMime is true", () => {
    const file = fakeFile(1024, "application/pdf");
    const error = validateUpload(file, MAX_AVATAR_SIZE, { checkMime: true });
    expect(error).toContain("Invalid file type");
    expect(error).toContain("application/pdf");
  });

  test("ignores MIME when checkMime is false/omitted", () => {
    const file = fakeFile(1024, "application/pdf");
    expect(validateUpload(file, MAX_AVATAR_SIZE)).toBeNull();
    expect(validateUpload(file, MAX_AVATAR_SIZE, { checkMime: false })).toBeNull();
  });

  test("size check runs before MIME check", () => {
    const file = fakeFile(MAX_AVATAR_SIZE + 1, "application/pdf");
    const error = validateUpload(file, MAX_AVATAR_SIZE, { checkMime: true });
    // Should report size error, not MIME error
    expect(error).toContain("File too large");
  });
});

// ── Unit tests for isValidImageMime ──

describe("isValidImageMime", () => {
  test("accepts PNG", () => expect(isValidImageMime("image/png")).toBe(true));
  test("accepts JPEG", () => expect(isValidImageMime("image/jpeg")).toBe(true));
  test("accepts WebP", () => expect(isValidImageMime("image/webp")).toBe(true));
  test("accepts GIF", () => expect(isValidImageMime("image/gif")).toBe(true));
  test("rejects PDF", () => expect(isValidImageMime("application/pdf")).toBe(false));
  test("rejects SVG", () => expect(isValidImageMime("image/svg+xml")).toBe(false));
  test("rejects empty", () => expect(isValidImageMime("")).toBe(false));
  test("rejects text", () => expect(isValidImageMime("text/plain")).toBe(false));
});

// ── Integration tests: Character avatar upload ──

describe("Character avatar upload limits", () => {
  let db: Database;
  let app: Hono;
  let characterId: string;

  beforeEach(async () => {
    db = new Database(":memory:");
    runMigrations(db);
    app = createTestApp(db);

    const { character } = await createCharacter(db, STUB_CARD, undefined, {
      force: true,
    });
    characterId = character.id;
  });

  test("rejects avatar exceeding 50 MB with 413", async () => {
    const oversized = fakeFile(MAX_AVATAR_SIZE + 1, "image/png", "big.png");
    const res = await app.request(
      `/api/characters/${characterId}/avatar`,
      multipartUpload(oversized),
    );
    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.error).toContain("File too large");
  });

  test("rejects invalid MIME type with 413", async () => {
    const pdf = fakeFile(1024, "application/pdf", "doc.pdf");
    const res = await app.request(
      `/api/characters/${characterId}/avatar`,
      multipartUpload(pdf),
    );
    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.error).toContain("Invalid file type");
  });

  test("rejects SVG (potential XSS vector) with 413", async () => {
    const svg = fakeFile(1024, "image/svg+xml", "icon.svg");
    const res = await app.request(
      `/api/characters/${characterId}/avatar`,
      multipartUpload(svg),
    );
    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.error).toContain("Invalid file type");
  });

  test("accepts valid PNG within size limit", async () => {
    const pngData = minimalPNG();
    const png = new File([pngData.buffer as ArrayBuffer], "avatar.png", { type: "image/png" });
    const res = await app.request(
      `/api/characters/${characterId}/avatar`,
      multipartUpload(png),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.character.id).toBe(characterId);
  });

  test("accepts valid JPEG within size limit", async () => {
    const jpeg = fakeFile(1024, "image/jpeg", "avatar.jpg");
    const res = await app.request(
      `/api/characters/${characterId}/avatar`,
      multipartUpload(jpeg),
    );
    expect(res.status).toBe(200);
  });

  test("accepts file exactly at 50 MB limit", async () => {
    const exact = fakeFile(MAX_AVATAR_SIZE, "image/png", "exact.png");
    const res = await app.request(
      `/api/characters/${characterId}/avatar`,
      multipartUpload(exact),
    );
    expect(res.status).toBe(200);
  });
});

// ── Integration tests: Character card import ──

describe("Character card import limits", () => {
  let db: Database;
  let app: Hono;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    app = createTestApp(db);
  });

  test("rejects import exceeding 70 MB with 413", async () => {
    const oversized = fakeFile(
      MAX_CARD_IMPORT_SIZE + 1,
      "application/octet-stream",
      "huge.png",
    );
    const res = await app.request(
      "/api/characters/import",
      multipartUpload(oversized),
    );
    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.error).toContain("File too large");
    expect(data.error).toContain("70 MB");
  });

  test("accepts valid JSON card within size limit", async () => {
    const cardJson = JSON.stringify({
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "Imported Bot",
        description: "test",
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
    });
    const file = new File([cardJson], "card.json", {
      type: "application/json",
    });
    const res = await app.request(
      "/api/characters/import",
      multipartUpload(file),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.character.name).toBe("Imported Bot");
  });
});

// ── Integration tests: Persona avatar upload ──

describe("Persona avatar upload limits", () => {
  let db: Database;
  let app: Hono;
  let personaId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    app = createTestApp(db);

    const persona = createPersona(db, { name: "Test Persona" });
    personaId = persona.id;
  });

  test("rejects avatar exceeding 50 MB with 413", async () => {
    const oversized = fakeFile(MAX_AVATAR_SIZE + 1, "image/png", "big.png");
    const res = await app.request(
      `/api/personas/${personaId}/avatar`,
      multipartUpload(oversized),
    );
    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.error).toContain("File too large");
  });

  test("rejects invalid MIME type with 413", async () => {
    const pdf = fakeFile(1024, "text/plain", "notes.txt");
    const res = await app.request(
      `/api/personas/${personaId}/avatar`,
      multipartUpload(pdf),
    );
    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.error).toContain("Invalid file type");
  });

  test("accepts valid WebP within size limit", async () => {
    const webp = fakeFile(2048, "image/webp", "avatar.webp");
    const res = await app.request(
      `/api/personas/${personaId}/avatar`,
      multipartUpload(webp),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.persona.id).toBe(personaId);
  });

  test("accepts valid GIF within size limit", async () => {
    const gif = fakeFile(2048, "image/gif", "avatar.gif");
    const res = await app.request(
      `/api/personas/${personaId}/avatar`,
      multipartUpload(gif),
    );
    expect(res.status).toBe(200);
  });

  test("accepts file exactly at 50 MB limit", async () => {
    const exact = fakeFile(MAX_AVATAR_SIZE, "image/png", "exact.png");
    const res = await app.request(
      `/api/personas/${personaId}/avatar`,
      multipartUpload(exact),
    );
    expect(res.status).toBe(200);
  });
});
