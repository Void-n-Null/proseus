import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import {
  createChat,
  getChat,
  listChats,
  updateChat,
  deleteChat,
  togglePinChat,
  duplicateChat,
  type ChatListOptions,
} from "../db/chats.ts";
import { addMessage, getChatTree } from "../db/messages.ts";
import { createSpeaker, getSpeaker } from "../db/speakers.ts";
import { getGlobalPersona } from "../db/personas.ts";
import { getCharacter, getCharacterAvatar } from "../db/characters.ts";
import { createMessagesRouter } from "./messages.ts";
import { getActivePath } from "../../shared/tree.ts";
import type { ImportJsonlRequest } from "../../shared/api-types.ts";

class ImportJsonlError extends Error {}

function dateStamp(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function safeFilenameBase(input: string): string {
  const trimmed = input.trim();
  const normalized = trimmed.length > 0 ? trimmed : "chat";
  return normalized
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "chat";
}

const CHAT_MAGIC = new Uint8Array([0x50, 0x52, 0x53, 0x43, 0x48, 0x41, 0x54, 0x01]);

function encodeChatArchive(payload: unknown): ArrayBuffer {
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const bytes = new Uint8Array(CHAT_MAGIC.length + body.length);
  bytes.set(CHAT_MAGIC, 0);
  bytes.set(body, CHAT_MAGIC.length);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function getCharacterIdForChat(db: Database, chatId: string): string | null {
  const row = db
    .query("SELECT character_id FROM chats WHERE id = $id")
    .get({ $id: chatId }) as { character_id: string | null } | null;
  return row?.character_id ?? null;
}

export function createChatsRouter(db: Database): Hono {
  const app = new Hono();
  const validSorts: NonNullable<ChatListOptions["sort"]>[] = [
    "updated_at",
    "created_at",
    "message_count",
    "name",
    "pinned_first",
  ];

  // ── Static routes MUST come before the /:chatId wildcard ──

  // POST /import-jsonl — import a SillyTavern/Chub JSONL chat
  app.post("/import-jsonl", async (c) => {
    const body = await c.req.json<ImportJsonlRequest>();

    if (!body.name || typeof body.name !== "string") {
      return c.json({ error: "name is required" }, 400);
    }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return c.json({ error: "messages array is required and must not be empty" }, 400);
    }
    if (!Array.isArray(body.speaker_map) || body.speaker_map.length === 0) {
      return c.json({ error: "speaker_map is required" }, 400);
    }

    const importChat = db.transaction(() => {
      // Resolve each mapping to a speaker_id, creating speakers as needed.
      // This mirrors the logic in POST /api/characters/:id/chat.
      const nameToSpeakerId = new Map<string, string>();
      const speakerIdSet = new Set<string>();
      let chatCharacterId: string | null = null;
      let userSpeakerName: string | null = null;

      for (const mapping of body.speaker_map) {
        if (!mapping.original_name) {
          throw new ImportJsonlError("Each speaker_map entry needs original_name");
        }

        let speakerId: string;

        if (mapping.is_user) {
          const existingUser = db
            .query("SELECT id, name FROM speakers WHERE is_user = 1 LIMIT 1")
            .get() as { id: string; name: string } | null;

          if (existingUser) {
            speakerId = existingUser.id;
            userSpeakerName = existingUser.name;
          } else {
            const userSpeaker = createSpeaker(db, { name: "User", is_user: true });
            speakerId = userSpeaker.id;
            userSpeakerName = userSpeaker.name;
          }
        } else if (mapping.character_id) {
          const character = getCharacter(db, mapping.character_id);
          if (!character) {
            throw new ImportJsonlError(`Character not found: ${mapping.character_id}`);
          }
          chatCharacterId = mapping.character_id;

          const existingBot = db
            .query(
              "SELECT id FROM speakers WHERE character_id = $cid AND is_user = 0 LIMIT 1",
            )
            .get({ $cid: mapping.character_id }) as { id: string } | null;

          if (existingBot) {
            speakerId = existingBot.id;
          } else {
            const botSpeaker = createSpeaker(db, {
              name: character.name,
              is_user: false,
              color: "#7c3aed",
            });
            speakerId = botSpeaker.id;

            db.query(
              "UPDATE speakers SET character_id = $cid WHERE id = $id",
            ).run({ $cid: mapping.character_id, $id: speakerId });

            const avatarData = getCharacterAvatar(db, mapping.character_id);
            if (avatarData) {
              db.query(
                "UPDATE speakers SET avatar_blob = $blob, avatar_mime = $mime WHERE id = $id",
              ).run({
                $blob: avatarData.avatar,
                $mime: "image/png",
                $id: speakerId,
              });
            }
          }
        } else {
          throw new ImportJsonlError(
            `Mapping for "${mapping.original_name}" needs either character_id (for bot) or is_user: true`,
          );
        }

        nameToSpeakerId.set(mapping.original_name, speakerId);
        speakerIdSet.add(speakerId);
      }

      for (const msg of body.messages) {
        if (!nameToSpeakerId.has(msg.name)) {
          throw new ImportJsonlError(
            `No speaker mapping for "${msg.name}". All speakers in the file must be mapped.`,
          );
        }
      }

      const chat = createChat(db, {
        name: body.name,
        speaker_ids: [...speakerIdSet],
        character_id: chatCharacterId,
      });

      const globalPersona = getGlobalPersona(db);
      if (globalPersona) {
        updateChat(db, chat.id, { persona_id: globalPersona.id });
      }

      let parentId: string | null = null;
      let messageCount = 0;

      for (const msg of body.messages) {
        const speakerId = nameToSpeakerId.get(msg.name)!;
        let messageText = msg.message;
        if (userSpeakerName) {
          messageText = messageText.replace(/\{\{user\}\}/gi, userSpeakerName);
        }

        const result = addMessage(db, {
          chat_id: chat.id,
          parent_id: parentId,
          message: messageText,
          speaker_id: speakerId,
          is_bot: !msg.is_user,
        });
        parentId = result.node.id;
        messageCount++;
      }

      return {
        chat: getChat(db, chat.id) ?? chat,
        message_count: messageCount,
      };
    });

    try {
      return c.json(importChat());
    } catch (err) {
      if (err instanceof ImportJsonlError) {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }
  });

  // Mount message sub-routes under /:chatId/*
  app.route("/:chatId", createMessagesRouter(db));

  // GET / — list all chats
  app.get("/", (c) => {
    const q = c.req.query("q") ?? undefined;
    const sortRaw = c.req.query("sort");
    let sort: ChatListOptions["sort"];
    if (sortRaw) {
      if (!validSorts.includes(sortRaw as NonNullable<ChatListOptions["sort"]>)) {
        return c.json({ error: "Invalid sort parameter" }, 400);
      }
      sort = sortRaw as NonNullable<ChatListOptions["sort"]>;
    }

    const chats = listChats(db, { q, sort });
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

  app.get("/:chatId/export/chat", (c) => {
    const chatId = c.req.param("chatId");
    const chat = getChat(db, chatId);
    if (!chat) {
      return c.json({ error: "Chat not found" }, 404);
    }

    const speakers = chat.speaker_ids
      .map((sid) => getSpeaker(db, sid))
      .filter((s): s is NonNullable<typeof s> => s !== null);
    const nodes = getChatTree(db, chatId);
    const characterId = getCharacterIdForChat(db, chatId);
    const character = characterId ? getCharacter(db, characterId) : null;
    const characterAvatar = characterId ? getCharacterAvatar(db, characterId) : null;
    const linkedCharacter = character
      ? {
          character,
          avatar: characterAvatar
            ? {
                mime: "image/png",
                base64: Buffer.from(characterAvatar.avatar).toString("base64"),
                hash: characterAvatar.avatar_hash,
              }
            : null,
        }
      : null;

    const payload = {
      format: "proseus.chat",
      version: 1,
      exported_at: Date.now(),
      chat,
      speakers,
      nodes,
      linked_character: linkedCharacter,
    };

    const filename = `${safeFilenameBase(chat.name)}-${dateStamp(payload.exported_at)}.chat`;
    return new Response(encodeChatArchive(payload), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });

  app.get("/:chatId/export/jsonl", (c) => {
    const chatId = c.req.param("chatId");
    const chat = getChat(db, chatId);
    if (!chat) {
      return c.json({ error: "Chat not found" }, 404);
    }

    const speakers = chat.speaker_ids
      .map((sid) => getSpeaker(db, sid))
      .filter((s): s is NonNullable<typeof s> => s !== null);
    const speakerById = new Map(speakers.map((s) => [s.id, s]));
    const userName = speakers.find((s) => s.is_user)?.name ?? "User";
    const characterName = speakers.find((s) => !s.is_user)?.name ?? chat.name;
    const nodesRecord = getChatTree(db, chatId);
    const nodesMap = new Map(Object.entries(nodesRecord));
    const nodeIds = chat.root_node_id ? getActivePath(chat.root_node_id, nodesMap) : [];

    const lines = [
      JSON.stringify({
        chat_metadata: {},
        user_name: userName,
        character_name: characterName,
      }),
      ...nodeIds.map((id) => {
        const node = nodesMap.get(id)!;
        const speaker = speakerById.get(node.speaker_id);
        return JSON.stringify({
          name: speaker?.name ?? "Unknown",
          is_user: !node.is_bot,
          is_name: true,
          is_system: false,
          mes: node.message,
          send_date: new Date(node.created_at).toISOString(),
          extra: {},
        });
      }),
    ];

    const exportedAt = Date.now();
    const filename = `${safeFilenameBase(chat.name)}-${dateStamp(exportedAt)}.jsonl`;
    c.header("Content-Type", "application/x-ndjson; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    return c.body(lines.join("\n"));
  });

  app.get("/:chatId/export/txt", (c) => {
    const chatId = c.req.param("chatId");
    const chat = getChat(db, chatId);
    if (!chat) {
      return c.json({ error: "Chat not found" }, 404);
    }

    const speakers = chat.speaker_ids
      .map((sid) => getSpeaker(db, sid))
      .filter((s): s is NonNullable<typeof s> => s !== null);
    const speakerById = new Map(speakers.map((s) => [s.id, s]));
    const nodesRecord = getChatTree(db, chatId);
    const nodesMap = new Map(Object.entries(nodesRecord));
    const nodeIds = chat.root_node_id ? getActivePath(chat.root_node_id, nodesMap) : [];

    const transcript = nodeIds
      .map((id) => {
        const node = nodesMap.get(id)!;
        const speaker = speakerById.get(node.speaker_id);
        return `${speaker?.name ?? "Unknown"}: ${node.message}`;
      })
      .join("\n\n");

    const exportedAt = Date.now();
    const filename = `${safeFilenameBase(chat.name)}-${dateStamp(exportedAt)}.txt`;
    c.header("Content-Type", "text/plain; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    return c.body(transcript);
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

  // PATCH /:chatId/pin — set pin state
  app.patch("/:chatId/pin", async (c) => {
    const chatId = c.req.param("chatId");
    const body = await c.req.json<{ is_pinned?: boolean }>();

    if (typeof body.is_pinned !== "boolean") {
      return c.json({ error: "is_pinned boolean is required" }, 400);
    }

    const updated = togglePinChat(db, chatId, body.is_pinned);
    if (!updated) {
      return c.json({ error: "Chat not found" }, 404);
    }

    return c.json({ ok: true });
  });

  // POST /:chatId/duplicate — duplicate a chat and return the new chat
  app.post("/:chatId/duplicate", (c) => {
    const chatId = c.req.param("chatId");
    const chat = duplicateChat(db, chatId);
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
