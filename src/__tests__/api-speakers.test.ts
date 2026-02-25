/**
 * api-speakers.test.ts — Tests for src/server/routes/speakers.ts
 *
 * Full CRUD for speakers + avatar endpoint.
 */

import { test, expect, describe, beforeEach } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { runMigrations } from "../server/db/schema.ts";
import { createSpeakersRouter } from "../server/routes/speakers.ts";

function createTestApp(db: Database): Hono {
  const app = new Hono().basePath("/api");
  app.route("/speakers", createSpeakersRouter(db));
  return app;
}

function jsonPost(body: unknown): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  };
}

function jsonPatch(body: unknown): RequestInit {
  return {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  };
}

describe("Speakers API routes", () => {
  let db: Database;
  let app: Hono;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    app = createTestApp(db);
  });

  // ── List ──

  test("GET /api/speakers — returns empty list initially", async () => {
    const res = await app.request("/api/speakers");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { speakers: unknown[] };
    expect(data.speakers).toEqual([]);
  });

  test("GET /api/speakers — returns created speakers", async () => {
    await app.request("/api/speakers", jsonPost({ name: "User", is_user: true }));
    await app.request("/api/speakers", jsonPost({ name: "Bot", is_user: false, color: "#7c3aed" }));

    const res = await app.request("/api/speakers");
    const data = (await res.json()) as { speakers: { name: string }[] };
    expect(data.speakers).toHaveLength(2);
  });

  // ── Create ──

  test("POST /api/speakers — creates speaker with name + is_user", async () => {
    const res = await app.request(
      "/api/speakers",
      jsonPost({ name: "Test User", is_user: true }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { speaker: { id: string; name: string; is_user: boolean } };
    expect(data.speaker.id).toBeTruthy();
    expect(data.speaker.name).toBe("Test User");
    expect(data.speaker.is_user).toBe(true);
  });

  test("POST /api/speakers — creates with optional color", async () => {
    const res = await app.request(
      "/api/speakers",
      jsonPost({ name: "Bot", is_user: false, color: "#ff0000" }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { speaker: { color: string } };
    expect(data.speaker.color).toBe("#ff0000");
  });

  test("POST /api/speakers — rejects missing name", async () => {
    const res = await app.request(
      "/api/speakers",
      jsonPost({ is_user: true }),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("name");
  });

  test("POST /api/speakers — rejects missing is_user", async () => {
    const res = await app.request(
      "/api/speakers",
      jsonPost({ name: "Test" }),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("is_user");
  });

  // ── Get by ID ──

  test("GET /api/speakers/:id — returns speaker", async () => {
    const createRes = await app.request(
      "/api/speakers",
      jsonPost({ name: "Alice", is_user: false }),
    );
    const { speaker } = (await createRes.json()) as { speaker: { id: string } };

    const res = await app.request(`/api/speakers/${speaker.id}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { speaker: { id: string; name: string } };
    expect(data.speaker.id).toBe(speaker.id);
    expect(data.speaker.name).toBe("Alice");
  });

  test("GET /api/speakers/:id — returns 404 for nonexistent", async () => {
    const res = await app.request("/api/speakers/nonexistent123");
    expect(res.status).toBe(404);
  });

  // ── Update ──

  test("PATCH /api/speakers/:id — updates name", async () => {
    const createRes = await app.request(
      "/api/speakers",
      jsonPost({ name: "Old Name", is_user: false }),
    );
    const { speaker } = (await createRes.json()) as { speaker: { id: string } };

    const res = await app.request(
      `/api/speakers/${speaker.id}`,
      jsonPatch({ name: "New Name" }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { speaker: { name: string } };
    expect(data.speaker.name).toBe("New Name");
  });

  test("PATCH /api/speakers/:id — updates color", async () => {
    const createRes = await app.request(
      "/api/speakers",
      jsonPost({ name: "Bot", is_user: false, color: "#000" }),
    );
    const { speaker } = (await createRes.json()) as { speaker: { id: string } };

    const res = await app.request(
      `/api/speakers/${speaker.id}`,
      jsonPatch({ color: "#fff" }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { speaker: { color: string } };
    expect(data.speaker.color).toBe("#fff");
  });

  test("PATCH /api/speakers/:id — returns 404 for nonexistent", async () => {
    const res = await app.request(
      "/api/speakers/nonexistent123",
      jsonPatch({ name: "Nope" }),
    );
    expect(res.status).toBe(404);
  });

  // ── Delete ──

  test("DELETE /api/speakers/:id — deletes speaker", async () => {
    const createRes = await app.request(
      "/api/speakers",
      jsonPost({ name: "ToDelete", is_user: false }),
    );
    const { speaker } = (await createRes.json()) as { speaker: { id: string } };

    const res = await app.request(`/api/speakers/${speaker.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);

    // Verify it's gone
    const getRes = await app.request(`/api/speakers/${speaker.id}`);
    expect(getRes.status).toBe(404);
  });

  test("DELETE /api/speakers/:id — returns 404 for nonexistent", async () => {
    const res = await app.request("/api/speakers/nonexistent123", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  // ── Avatar ──

  test("GET /api/speakers/:id/avatar — returns 404 when no avatar", async () => {
    const createRes = await app.request(
      "/api/speakers",
      jsonPost({ name: "NoAvatar", is_user: false }),
    );
    const { speaker } = (await createRes.json()) as { speaker: { id: string } };

    const res = await app.request(`/api/speakers/${speaker.id}/avatar`);
    expect(res.status).toBe(404);
  });
});
