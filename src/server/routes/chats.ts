import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import {
  createChat,
  getChat,
  listChats,
  updateChat,
  deleteChat,
} from "../db/chats.ts";
import { addMessage, getChatTree } from "../db/messages.ts";
import { getSpeaker } from "../db/speakers.ts";
import { getGlobalPersona } from "../db/personas.ts";
import { createMessagesRouter } from "./messages.ts";

export function createChatsRouter(db: Database): Hono {
  const app = new Hono();

  // Mount message sub-routes under /:chatId/*
  app.route("/:chatId", createMessagesRouter(db));

  // GET / — list all chats
  app.get("/", (c) => {
    const chats = listChats(db);
    return c.json({ chats });
  });

  // POST / — create a chat
  app.post("/", async (c) => {
    const body = await c.req.json<{
      name?: string;
      speaker_ids?: string[];
      tags?: string[];
      greeting?: string;
    }>();

    if (!body.name || typeof body.name !== "string") {
      return c.json({ error: "name is required" }, 400);
    }
    if (!body.speaker_ids || !Array.isArray(body.speaker_ids)) {
      return c.json({ error: "speaker_ids is required" }, 400);
    }

    const chat = createChat(db, {
      name: body.name,
      speaker_ids: body.speaker_ids,
      tags: body.tags,
    });

    // Apply the global persona to new chats automatically
    const globalPersona = getGlobalPersona(db);
    if (globalPersona) {
      updateChat(db, chat.id, { persona_id: globalPersona.id });
    }

    let rootNode = null;

    if (body.greeting) {
      // Find the first bot speaker to use for the greeting
      const botSpeakerId = body.speaker_ids.find((sid) => {
        const speaker = getSpeaker(db, sid);
        return speaker && !speaker.is_user;
      });

      if (botSpeakerId) {
        const result = addMessage(db, {
          chat_id: chat.id,
          parent_id: null,
          message: body.greeting,
          speaker_id: botSpeakerId,
          is_bot: true,
        });
        rootNode = result.node;
      }
    }

    // Always re-fetch so persona_id (and root_node_id if greeting was added) are current
    const finalChat = getChat(db, chat.id) ?? chat;
    return c.json({ chat: finalChat, root_node: rootNode });
  });

  // GET /:chatId — get a single chat + its speakers
  app.get("/:chatId", (c) => {
    const chatId = c.req.param("chatId");
    const chat = getChat(db, chatId);
    if (!chat) {
      return c.json({ error: "Chat not found" }, 404);
    }

    const speakers = chat.speaker_ids
      .map((sid) => getSpeaker(db, sid))
      .filter((s): s is NonNullable<typeof s> => s !== null);

    return c.json({ chat, speakers });
  });

  // PATCH /:chatId — update chat name/tags/persona_id
  app.patch("/:chatId", async (c) => {
    const chatId = c.req.param("chatId");
    const body = await c.req.json<{
      name?: string;
      tags?: string[];
      persona_id?: string | null;
    }>();

    const chat = updateChat(db, chatId, body);
    if (!chat) {
      return c.json({ error: "Chat not found" }, 404);
    }

    return c.json({ chat });
  });

  // DELETE /:chatId — delete a chat
  app.delete("/:chatId", (c) => {
    const chatId = c.req.param("chatId");
    const deleted = deleteChat(db, chatId);
    if (!deleted) {
      return c.json({ error: "Chat not found" }, 404);
    }

    return c.json({ ok: true });
  });

  return app;
}
