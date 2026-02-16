import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import {
  addMessage,
  editMessage,
  deleteMessage,
  getChatTree,
  switchBranch,
  swipeSibling,
} from "../db/messages.ts";
import { getChat } from "../db/chats.ts";
import { getActivePath } from "../../shared/tree.ts";
import type { ChatNode } from "../../shared/types.ts";

export function createMessagesRouter(db: Database): Hono {
  const app = new Hono();

  // Middleware: verify chat exists for all routes
  app.use("/*", async (c, next) => {
    const chatId = c.req.param("chatId");
    if (!chatId) {
      return c.json({ error: "chatId is required" }, 400);
    }
    const chat = getChat(db, chatId);
    if (!chat) {
      return c.json({ error: "Chat not found" }, 404);
    }
    await next();
  });

  // GET /tree — load full node tree for a chat
  app.get("/tree", (c) => {
    const chatId = c.req.param("chatId")!;
    const chat = getChat(db, chatId)!;
    const nodes = getChatTree(db, chatId);

    return c.json({ nodes, root_node_id: chat.root_node_id });
  });

  // GET /active-path — compute active path
  app.get("/active-path", (c) => {
    const chatId = c.req.param("chatId")!;
    const chat = getChat(db, chatId)!;
    const nodesRecord = getChatTree(db, chatId);

    if (!chat.root_node_id) {
      return c.json({ active_path: { node_ids: [], nodes: [] } });
    }

    const nodesMap = new Map<string, ChatNode>(Object.entries(nodesRecord));
    const nodeIds = getActivePath(chat.root_node_id, nodesMap);
    const nodes = nodeIds
      .map((id) => nodesMap.get(id))
      .filter((n): n is ChatNode => n !== undefined);

    return c.json({ active_path: { node_ids: nodeIds, nodes } });
  });

  // POST /messages — add a message
  app.post("/messages", async (c) => {
    const chatId = c.req.param("chatId")!;
    const body = await c.req.json<{
      parent_id?: string;
      message?: string;
      speaker_id?: string;
      is_bot?: boolean;
      client_id?: string;
    }>();

    if (!body.parent_id || typeof body.parent_id !== "string") {
      return c.json({ error: "parent_id is required" }, 400);
    }
    if (body.message === undefined || typeof body.message !== "string") {
      return c.json({ error: "message is required" }, 400);
    }
    if (!body.speaker_id || typeof body.speaker_id !== "string") {
      return c.json({ error: "speaker_id is required" }, 400);
    }
    if (body.is_bot === undefined || typeof body.is_bot !== "boolean") {
      return c.json({ error: "is_bot is required" }, 400);
    }

    // Verify parent exists in this chat's tree
    const tree = getChatTree(db, chatId);
    if (!tree[body.parent_id]) {
      return c.json({ error: "Parent node not found" }, 400);
    }

    const result = addMessage(db, {
      chat_id: chatId,
      parent_id: body.parent_id,
      message: body.message,
      speaker_id: body.speaker_id,
      is_bot: body.is_bot,
      client_id: body.client_id,
    });

    return c.json({ node: result.node, updated_parent: result.updated_parent });
  });

  // PATCH /messages/:nodeId — edit a message
  app.patch("/messages/:nodeId", async (c) => {
    const nodeId = c.req.param("nodeId");
    const body = await c.req.json<{ message?: string }>();

    if (body.message === undefined || typeof body.message !== "string") {
      return c.json({ error: "message is required" }, 400);
    }

    const node = editMessage(db, nodeId, body.message);
    if (!node) {
      return c.json({ error: "Node not found" }, 404);
    }

    return c.json({ node });
  });

  // DELETE /messages/:nodeId — delete a message and its subtree
  app.delete("/messages/:nodeId", (c) => {
    const nodeId = c.req.param("nodeId");
    const deleted = deleteMessage(db, nodeId);
    if (!deleted) {
      return c.json({ error: "Node not found" }, 404);
    }

    return c.json({ ok: true });
  });

  // POST /switch-branch — switch branch
  app.post("/switch-branch", async (c) => {
    const chatId = c.req.param("chatId")!;
    const body = await c.req.json<{ node_id?: string }>();

    if (!body.node_id || typeof body.node_id !== "string") {
      return c.json({ error: "node_id is required" }, 400);
    }

    const updatedNodes = switchBranch(db, chatId, body.node_id);

    // Compute active path after the switch
    const chat = getChat(db, chatId)!;
    const nodesRecord = getChatTree(db, chatId);
    const nodesMap = new Map<string, ChatNode>(Object.entries(nodesRecord));

    let activePath = { node_ids: [] as string[], nodes: [] as ChatNode[] };
    if (chat.root_node_id) {
      const nodeIds = getActivePath(chat.root_node_id, nodesMap);
      const nodes = nodeIds
        .map((id) => nodesMap.get(id))
        .filter((n): n is ChatNode => n !== undefined);
      activePath = { node_ids: nodeIds, nodes };
    }

    return c.json({ updated_nodes: updatedNodes, active_path: activePath });
  });

  // POST /messages/:nodeId/swipe — swipe to sibling
  app.post("/messages/:nodeId/swipe", async (c) => {
    const nodeId = c.req.param("nodeId");
    const body = await c.req.json<{ direction?: "prev" | "next" }>();

    if (!body.direction || (body.direction !== "prev" && body.direction !== "next")) {
      return c.json({ error: "direction must be 'prev' or 'next'" }, 400);
    }

    const result = swipeSibling(db, nodeId, body.direction);
    if (!result) {
      return c.json({ error: "At boundary or invalid node" }, 400);
    }

    return c.json({
      updated_parent: result.updated_parent,
      active_sibling: result.active_sibling,
    });
  });

  return app;
}
