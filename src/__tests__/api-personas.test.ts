import { test, expect, describe, beforeEach } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { runMigrations } from "../server/db/schema.ts";
import { createPersonasRouter } from "../server/routes/personas.ts";
import { createChatsRouter } from "../server/routes/chats.ts";
import { createSpeaker } from "../server/db/speakers.ts";
import { createPersona } from "../server/db/personas.ts";

function createTestApp(db: Database): Hono {
  const app = new Hono().basePath("/api");
  app.route("/personas", createPersonasRouter(db));
  app.route("/chats", createChatsRouter(db));
  return app;
}

function jsonBody(body: unknown): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  };
}

describe("Personas API routes", () => {
  let db: Database;
  let app: Hono;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    app = createTestApp(db);
  });

  // ── List ──

  test("GET /api/personas — returns empty list initially", async () => {
    const res = await app.request("/api/personas");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.personas).toEqual([]);
  });

  test("GET /api/personas — returns created personas", async () => {
    await app.request("/api/personas", jsonBody({ name: "Alice" }));
    await app.request("/api/personas", jsonBody({ name: "Bob" }));

    const res = await app.request("/api/personas");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.personas).toHaveLength(2);
    expect(data.personas.map((p: { name: string }) => p.name)).toContain("Alice");
    expect(data.personas.map((p: { name: string }) => p.name)).toContain("Bob");
  });

  // ── Create ──

  test("POST /api/personas — creates persona with all fields", async () => {
    const res = await app.request(
      "/api/personas",
      jsonBody({ name: "Writer", prompt: "I write fiction.", is_global: true }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.persona.id).toBeTruthy();
    expect(data.persona.name).toBe("Writer");
    expect(data.persona.prompt).toBe("I write fiction.");
    expect(data.persona.is_global).toBe(true);
    expect(data.persona.avatar_url).toBeNull();
  });

  test("POST /api/personas — defaults prompt and is_global when omitted", async () => {
    const res = await app.request("/api/personas", jsonBody({ name: "Minimal" }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.persona.prompt).toBe("");
    expect(data.persona.is_global).toBe(false);
  });

  test("POST /api/personas — 400 when name is missing", async () => {
    const res = await app.request("/api/personas", jsonBody({ prompt: "no name" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  test("POST /api/personas — 400 when name is blank", async () => {
    const res = await app.request("/api/personas", jsonBody({ name: "   " }));
    expect(res.status).toBe(400);
  });

  // ── Get single ──

  test("GET /api/personas/:id — returns persona", async () => {
    const createRes = await app.request(
      "/api/personas",
      jsonBody({ name: "Alice" }),
    );
    const { persona } = await createRes.json();

    const res = await app.request(`/api/personas/${persona.id}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.persona.id).toBe(persona.id);
    expect(data.persona.name).toBe("Alice");
  });

  test("GET /api/personas/:id — 404 for nonexistent id", async () => {
    const res = await app.request("/api/personas/nonexistent");
    expect(res.status).toBe(404);
  });

  // ── Update ──

  test("PATCH /api/personas/:id — updates name and prompt", async () => {
    const createRes = await app.request(
      "/api/personas",
      jsonBody({ name: "Old Name", prompt: "old" }),
    );
    const { persona } = await createRes.json();

    const res = await app.request(`/api/personas/${persona.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "New Name", prompt: "new prompt" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.persona.name).toBe("New Name");
    expect(data.persona.prompt).toBe("new prompt");
  });

  test("PATCH /api/personas/:id — partial update preserves other fields", async () => {
    const createRes = await app.request(
      "/api/personas",
      jsonBody({ name: "Keep", prompt: "keep this", is_global: true }),
    );
    const { persona } = await createRes.json();

    const res = await app.request(`/api/personas/${persona.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Renamed" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.persona.prompt).toBe("keep this");
    expect(data.persona.is_global).toBe(true);
  });

  test("PATCH /api/personas/:id — 404 for nonexistent id", async () => {
    const res = await app.request("/api/personas/nonexistent", {
      method: "PATCH",
      body: JSON.stringify({ name: "x" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
  });

  // ── Delete ──

  test("DELETE /api/personas/:id — removes persona", async () => {
    const createRes = await app.request(
      "/api/personas",
      jsonBody({ name: "Doomed" }),
    );
    const { persona } = await createRes.json();

    const res = await app.request(`/api/personas/${persona.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    const getRes = await app.request(`/api/personas/${persona.id}`);
    expect(getRes.status).toBe(404);
  });

  test("DELETE /api/personas/:id — 404 for nonexistent id", async () => {
    const res = await app.request("/api/personas/nonexistent", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  // ── Set chat persona ──

  test("PUT /api/personas/chats/:chatId/persona — links persona to chat", async () => {
    const user = createSpeaker(db, { name: "User", is_user: true });
    const chatRes = await app.request(
      "/api/chats",
      jsonBody({ name: "My Chat", speaker_ids: [user.id] }),
    );
    const { chat } = await chatRes.json();

    const persona = createPersona(db, { name: "Writer" });

    const res = await app.request(
      `/api/personas/chats/${chat.id}/persona`,
      {
        method: "PUT",
        body: JSON.stringify({ persona_id: persona.id }),
        headers: { "Content-Type": "application/json" },
      },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.chat.persona_id).toBe(persona.id);
  });

  test("PUT /api/personas/chats/:chatId/persona — clears persona with null", async () => {
    const user = createSpeaker(db, { name: "User", is_user: true });
    const chatRes = await app.request(
      "/api/chats",
      jsonBody({ name: "My Chat", speaker_ids: [user.id] }),
    );
    const { chat } = await chatRes.json();

    const persona = createPersona(db, { name: "Writer" });

    // Link
    await app.request(`/api/personas/chats/${chat.id}/persona`, {
      method: "PUT",
      body: JSON.stringify({ persona_id: persona.id }),
      headers: { "Content-Type": "application/json" },
    });

    // Clear
    const res = await app.request(`/api/personas/chats/${chat.id}/persona`, {
      method: "PUT",
      body: JSON.stringify({ persona_id: null }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.chat.persona_id).toBeNull();
  });

  test("PUT /api/personas/chats/:chatId/persona — 404 for nonexistent chat", async () => {
    const persona = createPersona(db, { name: "Writer" });
    const res = await app.request("/api/personas/chats/nonexistent/persona", {
      method: "PUT",
      body: JSON.stringify({ persona_id: persona.id }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
  });

  // ── Global persona applied to new chats ──

  test("new chat inherits global persona automatically", async () => {
    const user = createSpeaker(db, { name: "User", is_user: true });

    // Create a global persona
    const personaRes = await app.request(
      "/api/personas",
      jsonBody({ name: "Global Writer", is_global: true }),
    );
    const { persona } = await personaRes.json();

    // Create a new chat
    const chatRes = await app.request(
      "/api/chats",
      jsonBody({ name: "New Chat", speaker_ids: [user.id] }),
    );
    expect(chatRes.status).toBe(200);
    const { chat } = await chatRes.json();
    expect(chat.persona_id).toBe(persona.id);
  });

  test("new chat gets no persona when none is global", async () => {
    const user = createSpeaker(db, { name: "User", is_user: true });

    // Create a non-global persona
    await app.request("/api/personas", jsonBody({ name: "Local", is_global: false }));

    const chatRes = await app.request(
      "/api/chats",
      jsonBody({ name: "New Chat", speaker_ids: [user.id] }),
    );
    const { chat } = await chatRes.json();
    expect(chat.persona_id).toBeNull();
  });

  // ── Avatar ──

  test("GET /api/personas/:id/avatar — 404 when no avatar set", async () => {
    const createRes = await app.request(
      "/api/personas",
      jsonBody({ name: "No Avatar" }),
    );
    const { persona } = await createRes.json();

    const res = await app.request(`/api/personas/${persona.id}/avatar`);
    expect(res.status).toBe(404);
  });
});
