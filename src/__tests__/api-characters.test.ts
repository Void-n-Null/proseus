/**
 * api-characters.test.ts — Tests for src/server/routes/characters.ts
 *
 * The characters route is the most complex in the app (641 lines). It handles:
 *  - CRUD for character cards
 *  - PNG and JSON file import via multipart upload
 *  - Chub URL import (mock external fetch)
 *  - Avatar serving with ETag + thumbnail resizing
 *  - Chat creation from character (creates speakers, chat, greeting message)
 *  - Recent chat retrieval
 *
 * Coverage:
 *  - POST /: create character from JSON body
 *  - GET /: list characters (lightweight, no avatars)
 *  - GET /:id: get full character detail
 *  - PATCH /:id: update character fields
 *  - DELETE /:id: remove character
 *  - POST /import: multipart JSON file import
 *  - POST /import-url: Chub URL import (mocked fetch)
 *  - POST /:id/chat: create chat from character
 *  - GET /:id/recent-chat: most recent chat for character
 *  - POST /:id/avatar: upload avatar image
 *  - Edge cases: missing name, not found, duplicate detection
 */

import {
  test,
  expect,
  describe,
  beforeEach,
  afterEach,
  mock,
} from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import * as fc from "fast-check";

import { runMigrations } from "../server/db/schema.ts";
import { createCharactersRouter } from "../server/routes/characters.ts";
import { createSpeaker } from "../server/db/speakers.ts";

// ── Test Helpers ──────────────────────────────────────────────

function createTestApp(db: Database): Hono {
  const app = new Hono().basePath("/api");
  app.route("/characters", createCharactersRouter(db));
  return app;
}

function jsonBody(body: unknown): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  };
}

function patchJson(body: unknown): RequestInit {
  return {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  };
}

function putJson(body: unknown): RequestInit {
  return {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  };
}

/** Build a minimal V2 JSON card string for import testing. */
function buildV2CardJson(overrides: Partial<{
  name: string;
  description: string;
  first_mes: string;
  personality: string;
  scenario: string;
  system_prompt: string;
}>): string {
  return JSON.stringify({
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: overrides.name ?? "TestBot",
      description: overrides.description ?? "A test character",
      personality: overrides.personality ?? "Friendly",
      scenario: overrides.scenario ?? "Testing scenario",
      first_mes: overrides.first_mes ?? "Hello! I'm TestBot.",
      mes_example: "",
      creator_notes: "",
      system_prompt: overrides.system_prompt ?? "",
      post_history_instructions: "",
      alternate_greetings: [],
      tags: ["test"],
      creator: "tester",
      character_version: "1.0",
      extensions: {},
    },
  });
}

/** Build a multipart FormData with a JSON file for import testing. */
function buildJsonImportForm(jsonStr: string, opts?: { force?: boolean }): FormData {
  const form = new FormData();
  const blob = new Blob([jsonStr], { type: "application/json" });
  form.append("file", new File([blob], "character.json", { type: "application/json" }));
  if (opts?.force) {
    form.append("force", "true");
  }
  return form;
}

// ── Tests ──────────────────────────────────────────────────────

describe("Characters API routes", () => {
  let db: Database;
  let app: Hono;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    app = createTestApp(db);
  });

  // ── POST / (create from JSON body) ────────────

  describe("POST /api/characters", () => {
    test("creates character and returns 201 with correct shape", async () => {
      const res = await app.request(
        "/api/characters",
        jsonBody({ name: "Alice", description: "A curious girl", personality: "Curious" }),
      );
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.character).toBeDefined();
      expect(data.character.id).toBeTruthy();
      expect(data.character.name).toBe("Alice");
      expect(data.character.description).toBe("A curious girl");
      expect(data.character.personality).toBe("Curious");
      expect(data.character.source_spec).toBe("v2");
      expect(data.character.avatar_url).toBeNull(); // No avatar uploaded
      expect(data.character.created_at).toBeNumber();
    });

    test("rejects missing name", async () => {
      const res = await app.request(
        "/api/characters",
        jsonBody({ description: "No name here" }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("name is required");
    });

    test("rejects empty name", async () => {
      const res = await app.request(
        "/api/characters",
        jsonBody({ name: "   " }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("name is required");
    });

    test("defaults missing fields to empty strings", async () => {
      const res = await app.request(
        "/api/characters",
        jsonBody({ name: "MinimalBot" }),
      );
      expect(res.status).toBe(201);
      const data = await res.json();
      const ch = data.character;
      expect(ch.description).toBe("");
      expect(ch.personality).toBe("");
      expect(ch.scenario).toBe("");
      expect(ch.first_mes).toBe("");
      expect(ch.mes_example).toBe("");
      expect(ch.system_prompt).toBe("");
      expect(ch.alternate_greetings).toEqual([]);
      expect(ch.tags).toEqual([]);
    });

    test("force=true always creates (used by POST /)", async () => {
      // POST / always uses force: true, so duplicates are allowed
      const body = { name: "DupeBot", description: "Same data" };
      const res1 = await app.request("/api/characters", jsonBody(body));
      const res2 = await app.request("/api/characters", jsonBody(body));
      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      const data1 = await res1.json();
      const data2 = await res2.json();
      // Different IDs — both created
      expect(data1.character.id).not.toBe(data2.character.id);
    });
  });

  // ── GET / (list characters) ───────────────────

  describe("GET /api/characters", () => {
    test("returns empty list initially", async () => {
      const res = await app.request("/api/characters");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.characters).toEqual([]);
    });

    test("returns lightweight list items (no avatar blobs)", async () => {
      await app.request("/api/characters", jsonBody({ name: "Bot1", tags: ["rp"] }));
      await app.request("/api/characters", jsonBody({ name: "Bot2", creator: "alice" }));

      const res = await app.request("/api/characters");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.characters).toHaveLength(2);

      // List items have limited fields
      for (const item of data.characters) {
        expect(item.id).toBeTruthy();
        expect(item.name).toBeTruthy();
        expect(item).toHaveProperty("description");
        expect(item).toHaveProperty("avatar_url");
        expect(item).toHaveProperty("tags");
        expect(item).toHaveProperty("creator");
        expect(item).toHaveProperty("created_at");
        // Should NOT have full card fields
        expect(item).not.toHaveProperty("personality");
        expect(item).not.toHaveProperty("first_mes");
      }
    });
  });

  // ── GET /:id (full detail) ────────────────────

  describe("GET /api/characters/:id", () => {
    test("returns full character detail", async () => {
      const createRes = await app.request(
        "/api/characters",
        jsonBody({ name: "DetailBot", description: "Full detail", personality: "Verbose" }),
      );
      const { character: created } = await createRes.json();

      const res = await app.request(`/api/characters/${created.id}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.character.id).toBe(created.id);
      expect(data.character.name).toBe("DetailBot");
      expect(data.character.description).toBe("Full detail");
      expect(data.character.personality).toBe("Verbose");
      expect(data.character.extensions).toEqual({});
      expect(data.character.character_book).toBeNull();
    });

    test("returns 404 for nonexistent character", async () => {
      const res = await app.request("/api/characters/nonexistent-id");
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("not found");
    });

    test("GET /api/characters/import returns 405 (reserved path)", async () => {
      const res = await app.request("/api/characters/import");
      expect(res.status).toBe(405);
    });

    test("GET /api/characters/import-url returns 405 (reserved path)", async () => {
      const res = await app.request("/api/characters/import-url");
      expect(res.status).toBe(405);
    });
  });

  // ── PATCH /:id (update) ───────────────────────

  describe("PATCH /api/characters/:id", () => {
    test("updates specified fields only", async () => {
      const createRes = await app.request(
        "/api/characters",
        jsonBody({ name: "OldName", description: "Old desc", personality: "Shy" }),
      );
      const { character: created } = await createRes.json();

      const res = await app.request(
        `/api/characters/${created.id}`,
        patchJson({ name: "NewName", personality: "Bold" }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.character.name).toBe("NewName");
      expect(data.character.personality).toBe("Bold");
      // Unmodified fields preserved
      expect(data.character.description).toBe("Old desc");
    });

    test("can update array fields", async () => {
      const createRes = await app.request(
        "/api/characters",
        jsonBody({ name: "TagBot" }),
      );
      const { character: created } = await createRes.json();

      const res = await app.request(
        `/api/characters/${created.id}`,
        patchJson({ tags: ["fantasy", "rpg"], alternate_greetings: ["Hi!", "Hello!"] }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.character.tags).toEqual(["fantasy", "rpg"]);
      expect(data.character.alternate_greetings).toEqual(["Hi!", "Hello!"]);
    });

    test("returns 404 for nonexistent character", async () => {
      const res = await app.request(
        "/api/characters/nonexistent-id",
        patchJson({ name: "Nope" }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /:id ───────────────────────────────

  describe("DELETE /api/characters/:id", () => {
    test("deletes existing character", async () => {
      const createRes = await app.request(
        "/api/characters",
        jsonBody({ name: "DeleteMe" }),
      );
      const { character: created } = await createRes.json();

      const res = await app.request(`/api/characters/${created.id}`, { method: "DELETE" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);

      // Verify gone
      const getRes = await app.request(`/api/characters/${created.id}`);
      expect(getRes.status).toBe(404);
    });

    test("returns 404 for nonexistent character", async () => {
      const res = await app.request("/api/characters/nonexistent-id", { method: "DELETE" });
      expect(res.status).toBe(404);
    });
  });

  // ── POST /import (JSON file upload) ───────────

  describe("POST /api/characters/import", () => {
    test("imports V2 JSON card", async () => {
      const cardJson = buildV2CardJson({ name: "ImportBot", first_mes: "Greetings!" });
      const form = buildJsonImportForm(cardJson);

      const res = await app.request("/api/characters/import", {
        method: "POST",
        body: form,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.character).toBeDefined();
      expect(data.character.name).toBe("ImportBot");
      expect(data.character.first_mes).toBe("Greetings!");
      expect(data.character.source_spec).toBe("v2");
    });

    test("detects duplicate on re-import (same content)", async () => {
      const cardJson = buildV2CardJson({ name: "DupeImport" });
      const form1 = buildJsonImportForm(cardJson);
      const form2 = buildJsonImportForm(cardJson);

      const res1 = await app.request("/api/characters/import", {
        method: "POST",
        body: form1,
      });
      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.duplicate).toBeFalsy();

      const res2 = await app.request("/api/characters/import", {
        method: "POST",
        body: form2,
      });
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.duplicate).toBe(true);
      // Same ID returned
      expect(data2.character.id).toBe(data1.character.id);
    });

    test("force=true bypasses duplicate detection", async () => {
      const cardJson = buildV2CardJson({ name: "ForceImport" });
      const form1 = buildJsonImportForm(cardJson);
      const form2 = buildJsonImportForm(cardJson, { force: true });

      await app.request("/api/characters/import", { method: "POST", body: form1 });
      const res2 = await app.request("/api/characters/import", { method: "POST", body: form2 });
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      // Not flagged as duplicate even though content is same
      expect(data2.duplicate).toBeFalsy();
    });

    test("rejects invalid JSON", async () => {
      const form = new FormData();
      const blob = new Blob(["not valid json {{{"], { type: "application/json" });
      form.append("file", new File([blob], "bad.json"));

      const res = await app.request("/api/characters/import", {
        method: "POST",
        body: form,
      });
      expect(res.status).toBe(400);
    });

    test("rejects request without file field", async () => {
      const form = new FormData();
      form.append("notfile", "hello");

      const res = await app.request("/api/characters/import", {
        method: "POST",
        body: form,
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("No file");
    });
  });

  // ── POST /import-url (Chub URL import) ────────

  describe("POST /api/characters/import-url", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    test("imports character from chub.ai URL", async () => {
      globalThis.fetch = mock((url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

        // Chub API call
        if (urlStr.includes("api.chub.ai/api/characters/creator/test-char")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                node: {
                  name: "ChubBot",
                  definition: {
                    name: "ChubBot",
                    description: "A character from Chub",
                    personality: "Adventurous",
                    scenario: "Fantasy world",
                    first_message: "Welcome, adventurer!",
                    example_dialogs: "",
                    system_prompt: "",
                    post_history_instructions: "",
                    alternate_greetings: [],
                    extensions: {},
                  },
                },
              }),
              { status: 200 },
            ),
          );
        }

        // Avatar fetch
        if (urlStr.includes("avatars.charhub.io")) {
          return Promise.resolve(new Response(null, { status: 404 }));
        }

        return Promise.resolve(new Response(null, { status: 404 }));
      }) as unknown as typeof fetch;

      const res = await app.request(
        "/api/characters/import-url",
        jsonBody({ url: "https://chub.ai/characters/creator/test-char" }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.character).toBeDefined();
      expect(data.character.name).toBe("ChubBot");
    });

    test("rejects missing url", async () => {
      const res = await app.request(
        "/api/characters/import-url",
        jsonBody({}),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("url is required");
    });

    test("rejects invalid URL (not a chub host)", async () => {
      const res = await app.request(
        "/api/characters/import-url",
        jsonBody({ url: "https://example.com/characters/foo/bar" }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid URL");
    });

    test("rejects chub URL with invalid path", async () => {
      const res = await app.request(
        "/api/characters/import-url",
        jsonBody({ url: "https://chub.ai/not-characters/foo" }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid URL");
    });

    test("handles Chub API error gracefully", async () => {
      globalThis.fetch = mock((_url: string | URL | Request) => {
        return Promise.resolve(new Response(null, { status: 500 }));
      }) as unknown as typeof fetch;

      const res = await app.request(
        "/api/characters/import-url",
        jsonBody({ url: "https://chub.ai/characters/creator/broken-char" }),
      );
      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.error).toContain("HTTP 500");
    });

    test("handles Chub API missing definition", async () => {
      globalThis.fetch = mock((_url: string | URL | Request) => {
        return Promise.resolve(
          new Response(JSON.stringify({ node: {} }), { status: 200 }),
        );
      }) as unknown as typeof fetch;

      const res = await app.request(
        "/api/characters/import-url",
        jsonBody({ url: "https://chub.ai/characters/creator/no-def" }),
      );
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("no character definition");
    });

    test("handles network failure gracefully", async () => {
      globalThis.fetch = mock((_url: string | URL | Request) => {
        return Promise.reject(new Error("ECONNREFUSED"));
      }) as unknown as typeof fetch;

      const res = await app.request(
        "/api/characters/import-url",
        jsonBody({ url: "https://chub.ai/characters/creator/offline" }),
      );
      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.error).toContain("Could not fetch");
    });

    test("imports numeric ID URL (resolves via API)", async () => {
      let callCount = 0;
      globalThis.fetch = mock((url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        callCount++;

        // First call: resolve numeric ID
        if (urlStr.includes("api.chub.ai/api/characters/12345") && !urlStr.includes("full=true")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ node: { fullPath: "numcreator/numbot" } }),
              { status: 200 },
            ),
          );
        }

        // Second call: fetch full card data
        if (urlStr.includes("api.chub.ai/api/characters/numcreator/numbot")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                node: {
                  name: "NumBot",
                  definition: {
                    name: "NumBot",
                    description: "Resolved from numeric ID",
                    personality: "",
                    scenario: "",
                    first_message: "",
                    example_dialogs: "",
                    system_prompt: "",
                    post_history_instructions: "",
                    alternate_greetings: [],
                    extensions: {},
                  },
                },
              }),
              { status: 200 },
            ),
          );
        }

        // Avatar
        if (urlStr.includes("avatars.charhub.io")) {
          return Promise.resolve(new Response(null, { status: 404 }));
        }

        return Promise.resolve(new Response(null, { status: 404 }));
      }) as unknown as typeof fetch;

      const res = await app.request(
        "/api/characters/import-url",
        jsonBody({ url: "https://chub.ai/characters/12345" }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.character.name).toBe("NumBot");
    });

    test("accepts venus.chub.ai URL", async () => {
      globalThis.fetch = mock((url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.includes("api.chub.ai")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                node: {
                  name: "VenusBot",
                  definition: {
                    name: "VenusBot",
                    description: "From Venus",
                    personality: "",
                    scenario: "",
                    first_message: "",
                    example_dialogs: "",
                    extensions: {},
                  },
                },
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }) as unknown as typeof fetch;

      const res = await app.request(
        "/api/characters/import-url",
        jsonBody({ url: "https://venus.chub.ai/characters/creator/venus-char" }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.character.name).toBe("VenusBot");
    });
  });

  // ── POST /:id/chat (create chat from character) ─

  describe("POST /api/characters/:id/chat", () => {
    test("creates chat with speakers and greeting", async () => {
      const createRes = await app.request(
        "/api/characters",
        jsonBody({ name: "ChatBot", first_mes: "Hello there!" }),
      );
      const { character } = await createRes.json();

      const res = await app.request(`/api/characters/${character.id}/chat`, {
        method: "POST",
      });
      expect(res.status).toBe(200);
      const data = await res.json();

      // Chat created
      expect(data.chat).toBeDefined();
      expect(data.chat.id).toBeTruthy();
      expect(data.chat.name).toBe("ChatBot");

      // Speakers created
      expect(data.speakers).toBeDefined();
      expect(data.speakers.user_id).toBeTruthy();
      expect(data.speakers.bot_id).toBeTruthy();
      expect(data.speakers.user_id).not.toBe(data.speakers.bot_id);

      // Root node with greeting
      expect(data.root_node).toBeDefined();
      expect(data.root_node.message).toBe("Hello there!");
      expect(data.root_node.is_bot).toBe(true);
    });

    test("creates chat without greeting when first_mes is empty", async () => {
      const createRes = await app.request(
        "/api/characters",
        jsonBody({ name: "SilentBot" }),
      );
      const { character } = await createRes.json();

      const res = await app.request(`/api/characters/${character.id}/chat`, {
        method: "POST",
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.chat).toBeDefined();
      expect(data.root_node).toBeNull();
    });

    test("reuses bot speaker across multiple chats", async () => {
      const createRes = await app.request(
        "/api/characters",
        jsonBody({ name: "MultiChatBot", first_mes: "Hi!" }),
      );
      const { character } = await createRes.json();

      const res1 = await app.request(`/api/characters/${character.id}/chat`, { method: "POST" });
      const res2 = await app.request(`/api/characters/${character.id}/chat`, { method: "POST" });
      const data1 = await res1.json();
      const data2 = await res2.json();

      // Same bot speaker reused
      expect(data1.speakers.bot_id).toBe(data2.speakers.bot_id);
      // Same user speaker reused
      expect(data1.speakers.user_id).toBe(data2.speakers.user_id);
      // Different chats
      expect(data1.chat.id).not.toBe(data2.chat.id);
    });

    test("returns 404 for nonexistent character", async () => {
      const res = await app.request("/api/characters/nonexistent/chat", { method: "POST" });
      expect(res.status).toBe(404);
    });
  });

  // ── GET /:id/recent-chat ──────────────────────

  describe("GET /api/characters/:id/recent-chat", () => {
    test("returns null when no chats exist", async () => {
      const createRes = await app.request(
        "/api/characters",
        jsonBody({ name: "NoChatBot" }),
      );
      const { character } = await createRes.json();

      const res = await app.request(`/api/characters/${character.id}/recent-chat`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.chat).toBeNull();
    });

    test("returns most recent chat", async () => {
      const createRes = await app.request(
        "/api/characters",
        jsonBody({ name: "RecentBot", first_mes: "Hey!" }),
      );
      const { character } = await createRes.json();

      // Create first chat
      const res1 = await app.request(`/api/characters/${character.id}/chat`, { method: "POST" });
      const chat1 = (await res1.json()).chat;

      // Ensure second chat has a strictly later updated_at
      // (both can land in the same ms with fast SQLite)
      db.query("UPDATE chats SET updated_at = updated_at - 1000 WHERE id = $id").run({
        $id: chat1.id,
      });

      const res2 = await app.request(`/api/characters/${character.id}/chat`, { method: "POST" });
      const chat2 = (await res2.json()).chat;

      const res = await app.request(`/api/characters/${character.id}/recent-chat`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.chat).toBeDefined();
      expect(data.chat.id).toBe(chat2.id);
      expect(data.chat.name).toBeTruthy();
    });
  });

  // ── POST /:id/avatar (upload avatar) ──────────

  describe("POST /api/characters/:id/avatar", () => {
    test("uploads avatar image", async () => {
      const createRes = await app.request(
        "/api/characters",
        jsonBody({ name: "AvatarBot" }),
      );
      const { character } = await createRes.json();
      expect(character.avatar_url).toBeNull();

      // Upload a small dummy image
      const form = new FormData();
      const imageData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(100).fill(0)]);
      form.append("file", new File([imageData], "avatar.png", { type: "image/png" }));

      const res = await app.request(`/api/characters/${character.id}/avatar`, {
        method: "POST",
        body: form,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.character.avatar_url).toContain(`/api/characters/${character.id}/avatar`);
      expect(data.character.avatar_hash).toBeTruthy();
    });

    test("returns 404 for nonexistent character", async () => {
      const form = new FormData();
      form.append("file", new File([new Uint8Array(10)], "avatar.png"));

      const res = await app.request("/api/characters/nonexistent/avatar", {
        method: "POST",
        body: form,
      });
      expect(res.status).toBe(404);
    });

    test("rejects missing file", async () => {
      const createRes = await app.request(
        "/api/characters",
        jsonBody({ name: "NoFileBot" }),
      );
      const { character } = await createRes.json();

      const form = new FormData();
      form.append("notfile", "hello");

      const res = await app.request(`/api/characters/${character.id}/avatar`, {
        method: "POST",
        body: form,
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("No file");
    });
  });

  // ── GET /:id/avatar (serve avatar) ────────────

  describe("GET /api/characters/:id/avatar", () => {
    test("returns 404 when no avatar", async () => {
      const createRes = await app.request(
        "/api/characters",
        jsonBody({ name: "NoAvBot" }),
      );
      const { character } = await createRes.json();

      const res = await app.request(`/api/characters/${character.id}/avatar`);
      expect(res.status).toBe(404);
    });
  });

  // ── Property-Based ─────────────────────────────

  describe("Property-based tests", () => {
    test("any non-empty name creates a valid character", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
          async (name) => {
            const iterDb = new Database(":memory:");
            runMigrations(iterDb);
            const iterApp = createTestApp(iterDb);

            const res = await iterApp.request(
              "/api/characters",
              jsonBody({ name }),
            );
            expect(res.status).toBe(201);
            const data = await res.json();
            expect(data.character.name).toBe(name.trim());
            expect(data.character.id).toBeTruthy();
          },
        ),
        { numRuns: 20 },
      );
    });

    test("create → get round-trip preserves all fields", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
            description: fc.string({ maxLength: 200 }),
            personality: fc.string({ maxLength: 200 }),
            scenario: fc.string({ maxLength: 200 }),
            first_mes: fc.string({ maxLength: 200 }),
            system_prompt: fc.string({ maxLength: 200 }),
          }),
          async (fields) => {
            const iterDb = new Database(":memory:");
            runMigrations(iterDb);
            const iterApp = createTestApp(iterDb);

            const createRes = await iterApp.request(
              "/api/characters",
              jsonBody(fields),
            );
            const { character: created } = await createRes.json();

            const getRes = await iterApp.request(`/api/characters/${created.id}`);
            const { character: fetched } = await getRes.json();

            expect(fetched.name).toBe(fields.name.trim());
            expect(fetched.description).toBe(fields.description);
            expect(fetched.personality).toBe(fields.personality);
            expect(fetched.scenario).toBe(fields.scenario);
            expect(fetched.first_mes).toBe(fields.first_mes);
            expect(fetched.system_prompt).toBe(fields.system_prompt);
          },
        ),
        { numRuns: 15 },
      );
    });
  });
});
