import { test, expect, describe, beforeEach } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { runMigrations } from "../server/db/schema.ts";
import { createChatsRouter } from "../server/routes/chats.ts";
import { createSpeakersRouter } from "../server/routes/speakers.ts";
import { createSpeaker } from "../server/db/speakers.ts";
import { addMessage, getChatTree } from "../server/db/messages.ts";

function createTestApp(db: Database): Hono {
  const app = new Hono().basePath("/api");
  app.route("/chats", createChatsRouter(db));
  app.route("/speakers", createSpeakersRouter(db));
  return app;
}

function json(body: unknown): { method: string; body: string; headers: Record<string, string> } {
  return {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  };
}

describe("Chat API routes", () => {
  let db: Database;
  let app: Hono;
  let userId: string;
  let botId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    app = createTestApp(db);

    const user = createSpeaker(db, { name: "User", is_user: true });
    const bot = createSpeaker(db, {
      name: "Bot",
      is_user: false,
      color: "#7c3aed",
    });
    userId = user.id;
    botId = bot.id;
  });

  test("POST /api/chats — creates chat, returns 200 with correct shape", async () => {
    const res = await app.request(
      "/api/chats",
      json({ name: "Test Chat", speaker_ids: [userId, botId], tags: ["rp"] }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.chat).toBeDefined();
    expect(data.chat.id).toBeTruthy();
    expect(data.chat.name).toBe("Test Chat");
    expect(data.chat.speaker_ids).toContain(userId);
    expect(data.chat.speaker_ids).toContain(botId);
    expect(data.chat.tags).toEqual(["rp"]);
    expect(data.root_node).toBeNull();
  });

  test("POST /api/chats with greeting — creates chat + root node", async () => {
    const res = await app.request(
      "/api/chats",
      json({
        name: "Greeting Chat",
        speaker_ids: [userId, botId],
        greeting: "Hello there!",
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.chat).toBeDefined();
    expect(data.chat.root_node_id).toBeTruthy();
    expect(data.root_node).toBeDefined();
    expect(data.root_node.message).toBe("Hello there!");
    expect(data.root_node.is_bot).toBe(true);
    expect(data.root_node.speaker_id).toBe(botId);
  });

  test("POST /api/chats missing name — returns 400", async () => {
    const res = await app.request(
      "/api/chats",
      json({ speaker_ids: [userId] }),
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  test("POST /api/chats missing speaker_ids — returns 400", async () => {
    const res = await app.request(
      "/api/chats",
      json({ name: "No speakers" }),
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  test("GET /api/chats — returns list", async () => {
    // Create two chats
    await app.request(
      "/api/chats",
      json({ name: "Chat A", speaker_ids: [userId] }),
    );
    await app.request(
      "/api/chats",
      json({ name: "Chat B", speaker_ids: [userId, botId] }),
    );

    const res = await app.request("/api/chats");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.chats).toBeDefined();
    expect(data.chats.length).toBe(2);
  });

  test("GET /api/chats?q= — filters by query", async () => {
    await app.request(
      "/api/chats",
      json({ name: "Dragon Keep", speaker_ids: [userId] }),
    );
    await app.request(
      "/api/chats",
      json({ name: "Ocean Port", speaker_ids: [userId] }),
    );

    const res = await app.request("/api/chats?q=dragon");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.chats).toHaveLength(1);
    expect(data.chats[0].name).toBe("Dragon Keep");
  });

  test("GET /api/chats?sort=pinned_first — returns pinned first", async () => {
    const pinnedRes = await app.request(
      "/api/chats",
      json({ name: "Pinned", speaker_ids: [userId] }),
    );
    const unpinnedRes = await app.request(
      "/api/chats",
      json({ name: "Unpinned", speaker_ids: [userId] }),
    );
    const pinnedData = await pinnedRes.json();
    const unpinnedData = await unpinnedRes.json();

    await app.request(`/api/chats/${pinnedData.chat.id}/pin`, {
      method: "PATCH",
      body: JSON.stringify({ is_pinned: true }),
      headers: { "Content-Type": "application/json" },
    });

    // Force pinned chat to look older by updated_at to prove pinned sort takes precedence.
    db.query("UPDATE chats SET updated_at = $ts WHERE id = $id").run({
      $id: pinnedData.chat.id,
      $ts: Date.now() - 1000,
    });
    db.query("UPDATE chats SET updated_at = $ts WHERE id = $id").run({
      $id: unpinnedData.chat.id,
      $ts: Date.now(),
    });

    const res = await app.request("/api/chats?sort=pinned_first");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.chats).toHaveLength(2);
    expect(data.chats[0].id).toBe(pinnedData.chat.id);
    expect(data.chats[0].is_pinned).toBe(true);
  });

  test("GET /api/chats?sort=bad — returns 400", async () => {
    const res = await app.request("/api/chats?sort=bad");
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  test("GET /api/chats/:id — returns chat + speakers", async () => {
    const createRes = await app.request(
      "/api/chats",
      json({ name: "Test Chat", speaker_ids: [userId, botId] }),
    );
    const { chat } = await createRes.json();

    const res = await app.request(`/api/chats/${chat.id}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.chat).toBeDefined();
    expect(data.chat.id).toBe(chat.id);
    expect(data.speakers).toBeDefined();
    expect(data.speakers.length).toBe(2);
    expect(data.speakers.map((s: { id: string }) => s.id)).toContain(userId);
    expect(data.speakers.map((s: { id: string }) => s.id)).toContain(botId);
  });

  test("GET /api/chats/:id with bad ID — returns 404", async () => {
    const res = await app.request("/api/chats/nonexistent");
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  test("PATCH /api/chats/:id — updates name", async () => {
    const createRes = await app.request(
      "/api/chats",
      json({ name: "Original", speaker_ids: [userId] }),
    );
    const { chat } = await createRes.json();

    const res = await app.request(`/api/chats/${chat.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Renamed" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.chat.name).toBe("Renamed");
  });

  test("PATCH /api/chats/:id — updates tags", async () => {
    const createRes = await app.request(
      "/api/chats",
      json({ name: "Tag Chat", speaker_ids: [userId], tags: ["old"] }),
    );
    const { chat } = await createRes.json();

    const res = await app.request(`/api/chats/${chat.id}`, {
      method: "PATCH",
      body: JSON.stringify({ tags: ["new", "updated"] }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.chat.tags).toEqual(["new", "updated"]);
  });

  test("PATCH /api/chats/:id with bad ID — returns 404", async () => {
    const res = await app.request("/api/chats/nonexistent", {
      method: "PATCH",
      body: JSON.stringify({ name: "nope" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
  });

  test("DELETE /api/chats/:id — removes chat", async () => {
    const createRes = await app.request(
      "/api/chats",
      json({ name: "To Delete", speaker_ids: [userId] }),
    );
    const { chat } = await createRes.json();

    const res = await app.request(`/api/chats/${chat.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Verify chat is gone
    const getRes = await app.request(`/api/chats/${chat.id}`);
    expect(getRes.status).toBe(404);
  });

  test("DELETE /api/chats/:id — cascades to nodes", async () => {
    const createRes = await app.request(
      "/api/chats",
      json({
        name: "Chat with nodes",
        speaker_ids: [userId, botId],
        greeting: "Hello!",
      }),
    );
    const { chat } = await createRes.json();

    // Add an extra message
    const tree = getChatTree(db, chat.id);
    const rootId = Object.keys(tree)[0]!;
    addMessage(db, {
      chat_id: chat.id,
      parent_id: rootId,
      message: "User reply",
      speaker_id: userId,
      is_bot: false,
    });

    // Delete the chat
    const res = await app.request(`/api/chats/${chat.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    // Verify nodes are gone
    const nodes = db
      .query("SELECT * FROM chat_nodes WHERE chat_id = $id")
      .all({ $id: chat.id });
    expect(nodes).toHaveLength(0);
  });

  test("DELETE /api/chats/:id with bad ID — returns 404", async () => {
    const res = await app.request("/api/chats/nonexistent", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  test("PATCH /api/chats/:id/pin — updates pin state", async () => {
    const createRes = await app.request(
      "/api/chats",
      json({ name: "Pin Target", speaker_ids: [userId] }),
    );
    const { chat } = await createRes.json();

    const res = await app.request(`/api/chats/${chat.id}/pin`, {
      method: "PATCH",
      body: JSON.stringify({ is_pinned: true }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    const listRes = await app.request("/api/chats?sort=pinned_first");
    const listData = await listRes.json();
    const item = listData.chats.find((c: { id: string }) => c.id === chat.id);
    expect(item).toBeDefined();
    expect(item.is_pinned).toBe(true);
  });

  test("PATCH /api/chats/:id/pin without boolean body — returns 400", async () => {
    const createRes = await app.request(
      "/api/chats",
      json({ name: "Pin Body", speaker_ids: [userId] }),
    );
    const { chat } = await createRes.json();
    const res = await app.request(`/api/chats/${chat.id}/pin`, {
      method: "PATCH",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
  });

  test("PATCH /api/chats/:id/pin bad ID — returns 404", async () => {
    const res = await app.request("/api/chats/nonexistent/pin", {
      method: "PATCH",
      body: JSON.stringify({ is_pinned: true }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
  });

  test("POST /api/chats/:id/duplicate — duplicates chat", async () => {
    const createRes = await app.request(
      "/api/chats",
      json({
        name: "Copy Me",
        speaker_ids: [userId, botId],
        greeting: "Hello from source",
      }),
    );
    const { chat } = await createRes.json();
    const sourceTree = getChatTree(db, chat.id);
    const sourceNodeIds = new Set(Object.keys(sourceTree));

    const res = await app.request(`/api/chats/${chat.id}/duplicate`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.chat).toBeDefined();
    expect(data.chat.id).not.toBe(chat.id);
    expect(data.chat.name).toBe("Copy Me (copy)");

    const copiedTree = getChatTree(db, data.chat.id);
    expect(Object.keys(copiedTree).length).toBe(Object.keys(sourceTree).length);
    for (const copiedId of Object.keys(copiedTree)) {
      expect(sourceNodeIds.has(copiedId)).toBe(false);
    }
  });

  test("POST /api/chats/:id/duplicate bad ID — returns 404", async () => {
    const res = await app.request("/api/chats/nonexistent/duplicate", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });
});
