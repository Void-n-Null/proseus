import { test, expect, describe, beforeEach } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { runMigrations } from "../server/db/schema.ts";
import { createChatsRouter } from "../server/routes/chats.ts";
import { createSpeaker } from "../server/db/speakers.ts";
import { createChat } from "../server/db/chats.ts";
import { addMessage, switchBranch } from "../server/db/messages.ts";

function createTestApp(db: Database): Hono {
  const app = new Hono().basePath("/api");
  app.route("/chats", createChatsRouter(db));
  return app;
}

function jsonReq(
  method: string,
  body: unknown,
): { method: string; body: string; headers: Record<string, string> } {
  return {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  };
}

describe("Messages API routes", () => {
  let db: Database;
  let app: Hono;
  let userId: string;
  let botId: string;
  let chatId: string;
  let rootNodeId: string;
  let child1Id: string;
  let child2Id: string;

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

    const chat = createChat(db, {
      name: "Test Chat",
      speaker_ids: [userId, botId],
    });
    chatId = chat.id;

    // Build a small tree: root -> child1, child2 (branch point)
    const root = addMessage(db, {
      chat_id: chatId,
      parent_id: null,
      message: "Hello! I'm the bot.",
      speaker_id: botId,
      is_bot: true,
    });
    rootNodeId = root.node.id;

    const child1 = addMessage(db, {
      chat_id: chatId,
      parent_id: rootNodeId,
      message: "First response",
      speaker_id: userId,
      is_bot: false,
    });
    child1Id = child1.node.id;

    const child2 = addMessage(db, {
      chat_id: chatId,
      parent_id: rootNodeId,
      message: "Second response (alt branch)",
      speaker_id: userId,
      is_bot: false,
    });
    child2Id = child2.node.id;
  });

  // --- GET /tree ---

  test("GET /api/chats/:chatId/tree — returns all nodes", async () => {
    const res = await app.request(`/api/chats/${chatId}/tree`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.nodes).toBeDefined();
    expect(data.root_node_id).toBe(rootNodeId);
    expect(Object.keys(data.nodes).length).toBe(3);
    expect(data.nodes[rootNodeId]).toBeDefined();
    expect(data.nodes[child1Id]).toBeDefined();
    expect(data.nodes[child2Id]).toBeDefined();
  });

  // --- GET /active-path ---

  test("GET /api/chats/:chatId/active-path — returns correct path", async () => {
    // active_child_index on root should point to child2 (index 1, last added)
    const res = await app.request(`/api/chats/${chatId}/active-path`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.active_path).toBeDefined();
    expect(data.active_path.node_ids).toHaveLength(2);
    expect(data.active_path.node_ids[0]).toBe(rootNodeId);
    expect(data.active_path.node_ids[1]).toBe(child2Id);
    expect(data.active_path.nodes).toHaveLength(2);
  });

  // --- POST /messages ---

  test("POST /api/chats/:chatId/messages — adds a node", async () => {
    const res = await app.request(
      `/api/chats/${chatId}/messages`,
      jsonReq("POST", {
        parent_id: child1Id,
        message: "New message",
        speaker_id: botId,
        is_bot: true,
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.node).toBeDefined();
    expect(data.node.message).toBe("New message");
    expect(data.node.parent_id).toBe(child1Id);
    expect(data.node.is_bot).toBe(true);
    expect(data.updated_parent).toBeDefined();
    expect(data.updated_parent.child_ids).toContain(data.node.id);
  });

  test("POST /api/chats/:chatId/messages — adding second child to same parent creates branch", async () => {
    // child1 already has no children. Add two to it.
    const res1 = await app.request(
      `/api/chats/${chatId}/messages`,
      jsonReq("POST", {
        parent_id: child1Id,
        message: "Branch A",
        speaker_id: botId,
        is_bot: true,
      }),
    );
    expect(res1.status).toBe(200);
    const data1 = await res1.json();

    const res2 = await app.request(
      `/api/chats/${chatId}/messages`,
      jsonReq("POST", {
        parent_id: child1Id,
        message: "Branch B",
        speaker_id: botId,
        is_bot: true,
      }),
    );
    expect(res2.status).toBe(200);
    const data2 = await res2.json();

    expect(data2.updated_parent.child_ids).toHaveLength(2);
    expect(data2.updated_parent.child_ids).toContain(data1.node.id);
    expect(data2.updated_parent.child_ids).toContain(data2.node.id);
    // active_child_index points to the newest (index 1)
    expect(data2.updated_parent.active_child_index).toBe(1);
  });

  // --- PATCH /messages/:nodeId ---

  test("PATCH /api/chats/:chatId/messages/:nodeId — edits message", async () => {
    const res = await app.request(
      `/api/chats/${chatId}/messages/${child1Id}`,
      jsonReq("PATCH", { message: "Edited message" }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.node.message).toBe("Edited message");
    expect(data.node.updated_at).toBeTruthy();
  });

  test("PATCH /api/chats/:chatId/messages/:nodeId — 404 for nonexistent node", async () => {
    const res = await app.request(
      `/api/chats/${chatId}/messages/nonexistent`,
      jsonReq("PATCH", { message: "nope" }),
    );

    expect(res.status).toBe(404);
  });

  // --- DELETE /messages/:nodeId ---

  test("DELETE /api/chats/:chatId/messages/:nodeId — deletes node", async () => {
    const res = await app.request(
      `/api/chats/${chatId}/messages/${child2Id}`,
      { method: "DELETE" },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Verify node is gone from tree
    const treeRes = await app.request(`/api/chats/${chatId}/tree`);
    const treeData = await treeRes.json();
    expect(treeData.nodes[child2Id]).toBeUndefined();
  });

  test("DELETE /api/chats/:chatId/messages/:nodeId — 404 for nonexistent node", async () => {
    const res = await app.request(
      `/api/chats/${chatId}/messages/nonexistent`,
      { method: "DELETE" },
    );

    expect(res.status).toBe(404);
  });

  // --- POST /switch-branch ---

  test("POST /api/chats/:chatId/switch-branch — switches branch", async () => {
    // Currently active: root -> child2 (index 1). Switch to child1.
    const res = await app.request(
      `/api/chats/${chatId}/switch-branch`,
      jsonReq("POST", { node_id: child1Id }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.updated_nodes).toBeDefined();
    expect(data.updated_nodes.length).toBeGreaterThanOrEqual(1);
    expect(data.active_path).toBeDefined();
    expect(data.active_path.node_ids).toContain(child1Id);
    expect(data.active_path.node_ids).not.toContain(child2Id);
  });

  // --- POST /messages/:nodeId/swipe ---

  test("POST /api/chats/:chatId/messages/:nodeId/swipe — swipes next", async () => {
    // Switch to child1 first (index 0)
    switchBranch(db, chatId, child1Id);

    const res = await app.request(
      `/api/chats/${chatId}/messages/${child1Id}/swipe`,
      jsonReq("POST", { direction: "next" }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.updated_parent).toBeDefined();
    expect(data.updated_parent.active_child_index).toBe(1);
    expect(data.active_sibling).toBeDefined();
    expect(data.active_sibling.id).toBe(child2Id);
  });

  test("POST /api/chats/:chatId/messages/:nodeId/swipe — swipes prev", async () => {
    // Currently at child2 (index 1). Swipe prev.
    const res = await app.request(
      `/api/chats/${chatId}/messages/${child2Id}/swipe`,
      jsonReq("POST", { direction: "prev" }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.updated_parent).toBeDefined();
    expect(data.updated_parent.active_child_index).toBe(0);
    expect(data.active_sibling).toBeDefined();
    expect(data.active_sibling.id).toBe(child1Id);
  });

  test("POST /api/chats/:chatId/messages/:nodeId/swipe — clamped at boundary returns 400", async () => {
    // Switch to child1 (index 0), then try prev — should be at boundary
    switchBranch(db, chatId, child1Id);

    const res = await app.request(
      `/api/chats/${chatId}/messages/${child1Id}/swipe`,
      jsonReq("POST", { direction: "prev" }),
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  // --- Edge cases ---

  test("Bad chatId returns 404 for tree endpoint", async () => {
    const res = await app.request("/api/chats/nonexistent/tree");
    expect(res.status).toBe(404);
  });

  test("Bad chatId returns 404 for active-path endpoint", async () => {
    const res = await app.request("/api/chats/nonexistent/active-path");
    expect(res.status).toBe(404);
  });

  test("Add message with nonexistent parent returns 400", async () => {
    const res = await app.request(
      `/api/chats/${chatId}/messages`,
      jsonReq("POST", {
        parent_id: "nonexistent-parent",
        message: "orphan",
        speaker_id: userId,
        is_bot: false,
      }),
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });
});
