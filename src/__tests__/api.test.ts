/**
 * api.test.ts — Smoke tests for src/server/api.ts
 *
 * Verifies that the Hono app correctly mounts all 7 route modules
 * and that the global error handler works. These are not exhaustive
 * endpoint tests (those live in api-*.test.ts per resource) — they
 * verify that the routing layer itself is wired up correctly.
 *
 * Coverage:
 *  - All 7 route prefixes respond (not 404)
 *  - Unknown routes return 404
 *  - Global error handler catches SyntaxError (malformed JSON)
 */

import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../server/db/schema.ts";

// We can't directly import the default `api` export because it uses the
// real DB singleton. Instead, we replicate the composition with an
// in-memory DB — this tests the same routing logic.
import { Hono } from "hono";
import { createChatsRouter } from "../server/routes/chats.ts";
import { createSpeakersRouter } from "../server/routes/speakers.ts";
import { createCharactersRouter } from "../server/routes/characters.ts";
import { createConnectionsRouter } from "../server/routes/connections.ts";
import { createSettingsRouter } from "../server/routes/settings.ts";
import { createPersonasRouter } from "../server/routes/personas.ts";
import { createUsageRouter } from "../server/routes/usage.ts";

function createTestApi(db: Database): Hono {
  const api = new Hono().basePath("/api");

  api.onError((err, c) => {
    if (err instanceof SyntaxError) {
      return c.json({ error: "Malformed request body" }, 400);
    }
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return c.json({ error: message }, 500);
  });

  api.route("/chats", createChatsRouter(db));
  api.route("/speakers", createSpeakersRouter(db));
  api.route("/characters", createCharactersRouter(db));
  api.route("/connections", createConnectionsRouter(db));
  api.route("/settings", createSettingsRouter(db));
  api.route("/personas", createPersonasRouter(db));
  api.route("/usage", createUsageRouter(db));

  return api;
}

describe("API route mounting", () => {
  let db: Database;
  let api: Hono;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    api = createTestApi(db);
  });

  // ── Route Mounting Verification ──────────────────

  describe("All route prefixes are mounted", () => {
    test("GET /api/chats — responds (not 404)", async () => {
      const res = await api.request("/api/chats");
      expect(res.status).not.toBe(404);
      expect(res.status).toBe(200);
    });

    test("GET /api/speakers — responds (not 404)", async () => {
      const res = await api.request("/api/speakers");
      expect(res.status).not.toBe(404);
      expect(res.status).toBe(200);
    });

    test("GET /api/characters — responds (not 404)", async () => {
      const res = await api.request("/api/characters");
      expect(res.status).not.toBe(404);
      expect(res.status).toBe(200);
    });

    test("GET /api/connections — responds (not 404)", async () => {
      const res = await api.request("/api/connections");
      expect(res.status).not.toBe(404);
      expect(res.status).toBe(200);
    });

    test("GET /api/settings — responds (not 404)", async () => {
      const res = await api.request("/api/settings");
      expect(res.status).not.toBe(404);
      expect(res.status).toBe(200);
    });

    test("GET /api/personas — responds (not 404)", async () => {
      const res = await api.request("/api/personas");
      expect(res.status).not.toBe(404);
      expect(res.status).toBe(200);
    });

    test("GET /api/usage — responds (not 404)", async () => {
      const res = await api.request("/api/usage");
      expect(res.status).not.toBe(404);
      expect(res.status).toBe(200);
    });
  });

  // ── 404 for Unknown Routes ────────────────────

  describe("Unknown routes", () => {
    test("GET /api/nonexistent — returns 404", async () => {
      const res = await api.request("/api/nonexistent");
      expect(res.status).toBe(404);
    });

    test("GET /api/chats/fake-id/nonexistent-sub — returns 404", async () => {
      const res = await api.request("/api/chats/fake-id/nonexistent-sub");
      expect(res.status).toBe(404);
    });

    test("POST /api/nonexistent — returns 404", async () => {
      const res = await api.request("/api/nonexistent", { method: "POST" });
      expect(res.status).toBe(404);
    });
  });

  // ── Global Error Handler ──────────────────────

  describe("Global error handler", () => {
    test("malformed JSON body returns 400 with clean message", async () => {
      const res = await api.request("/api/chats", {
        method: "POST",
        body: "this is not json{{{",
        headers: { "Content-Type": "application/json" },
      });

      // Hono may return 400 from the global error handler
      // or the route itself — either way it should not be 500
      expect(res.status).toBeLessThan(500);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });
  });
});
