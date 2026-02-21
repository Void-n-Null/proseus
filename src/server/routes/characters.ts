import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import { parseSizeParam, resizeAvatar } from "../lib/thumbnail.ts";
import {
  createCharacter,
  getCharacter,
  getCharacterAvatar,
  listCharacters,
  deleteCharacter,
  updateCharacter,
} from "../db/characters.ts";
import {
  extractCardFromPNG,
  extractCardFromJSON,
  CardParseError,
} from "../lib/character-card-parser.ts";
import { createSpeaker } from "../db/speakers.ts";
import { createChat, updateChat } from "../db/chats.ts";
import { addMessage, getChatTree } from "../db/messages.ts";
import { getChat } from "../db/chats.ts";
import { getGlobalPersona } from "../db/personas.ts";

/** PNG magic bytes: \x89PNG\r\n\x1a\n */
function isPNG(data: Uint8Array): boolean {
  return (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  );
}

/**
 * Parse Chub URL to extract creator/slug.
 * Supports: chub.ai, venus.chub.ai, characterhub.org
 */
function parseChubUrl(
  urlStr: string,
): { creator: string; slug: string } | null {
  try {
    const url = new URL(urlStr);
    const validHosts = [
      "chub.ai",
      "www.chub.ai",
      "venus.chub.ai",
      "characterhub.org",
      "www.characterhub.org",
    ];

    if (!validHosts.includes(url.hostname)) return null;

    // Path pattern: /characters/{creator}/{slug}
    const match = url.pathname.match(/^\/characters\/([^/]+)\/([^/]+)\/?$/);
    if (!match?.[1] || !match[2]) return null;

    return { creator: match[1], slug: match[2] };
  } catch {
    return null;
  }
}

export function createCharactersRouter(db: Database): Hono {
  const app = new Hono();

  // GET / — list all characters (lightweight, no avatar blobs)
  app.get("/", (c) => {
    const characters = listCharacters(db);
    return c.json({ characters });
  });

  // GET /:id — full character detail
  app.get("/:id", (c) => {
    const id = c.req.param("id");

    // Intercept /avatar sub-route (Hono doesn't nest well with parameterized + static)
    if (id === "import" || id === "import-url") {
      return c.json({ error: "Use POST method" }, 405);
    }

    const character = getCharacter(db, id);
    if (!character) {
      return c.json({ error: "Character not found" }, 404);
    }
    return c.json({ character });
  });

  // GET /:id/avatar — serve avatar image with ETag caching (optional ?size= thumbnail)
  app.get("/:id/avatar", async (c) => {
    const id = c.req.param("id");
    const result = getCharacterAvatar(db, id);

    if (!result) {
      return c.json({ error: "Avatar not found" }, 404);
    }

    const size = parseSizeParam(c.req.query("size"));
    const { buffer, mime } = await resizeAvatar(
      result.avatar,
      "image/png",
      size,
      `character-${id}`,
    );

    // ETag / If-None-Match caching
    const etag = `"${result.avatar_hash}-${size ?? "full"}"`;
    const ifNoneMatch = c.req.header("If-None-Match");
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, { status: 304 });
    }

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": mime,
        ETag: etag,
        "Cache-Control": "public, max-age=86400, must-revalidate",
      },
    });
  });

  // POST / — create a character from scratch (JSON body, no file)
  app.post("/", async (c) => {
    const body = await c.req.json<{ name?: string; description?: string; personality?: string; scenario?: string; first_mes?: string; mes_example?: string; creator_notes?: string; system_prompt?: string; post_history_instructions?: string; alternate_greetings?: string[]; tags?: string[]; creator?: string; character_version?: string }>();

    if (!body.name?.trim()) {
      return c.json({ error: "name is required" }, 400);
    }

    const card: import("../lib/character-card-parser.ts").NormalizedCard = {
      name: body.name.trim(),
      description: body.description ?? "",
      personality: body.personality ?? "",
      scenario: body.scenario ?? "",
      first_mes: body.first_mes ?? "",
      mes_example: body.mes_example ?? "",
      creator_notes: body.creator_notes ?? "",
      system_prompt: body.system_prompt ?? "",
      post_history_instructions: body.post_history_instructions ?? "",
      alternate_greetings: body.alternate_greetings ?? [],
      tags: body.tags ?? [],
      creator: body.creator ?? "",
      character_version: body.character_version ?? "",
      source_spec: "v2",
      extensions: {},
      character_book: null,
    };

    const { character } = await createCharacter(db, card, undefined, { force: true });
    return c.json({ character }, 201);
  });

  // POST /import — multipart file upload (PNG or JSON)
  app.post("/import", async (c) => {
    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return c.json(
        { error: "Expected multipart/form-data with a 'file' field" },
        400,
      );
    }

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file provided. Include a 'file' field." }, 400);
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const force = formData.get("force") === "true";

    try {
      if (isPNG(buffer)) {
        // PNG import — extract card + store avatar
        const card = extractCardFromPNG(buffer);
        const { character, duplicate } = await createCharacter(
          db,
          card,
          buffer, // Store the complete original PNG as avatar
          { force },
        );
        return c.json({ character, duplicate });
      }

      // Try as JSON
      const text = new TextDecoder().decode(buffer);
      const card = extractCardFromJSON(text);
      const { character, duplicate } = await createCharacter(db, card, undefined, { force });
      return c.json({ character, duplicate });
    } catch (err) {
      if (err instanceof CardParseError) {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }
  });

  // POST /import-url — Chub URL import
  app.post("/import-url", async (c) => {
    const body = await c.req.json<{ url?: string }>();

    if (!body.url || typeof body.url !== "string") {
      return c.json({ error: "url is required" }, 400);
    }

    const parsed = parseChubUrl(body.url);
    if (!parsed) {
      return c.json(
        {
          error:
            "Invalid URL. Expected a Chub character URL like https://chub.ai/characters/{creator}/{slug}",
        },
        400,
      );
    }

    const avatarUrl = `https://avatars.charhub.io/avatars/${parsed.creator}/${parsed.slug}/chara_card_v2.png`;

    let response: Response;
    try {
      response = await fetch(avatarUrl, {
        headers: {
          "User-Agent": "Proseus/1.0",
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      return c.json(
        {
          error: `Could not download from Chub. Try downloading the PNG manually and importing the file. (${err instanceof Error ? err.message : "Network error"})`,
        },
        502,
      );
    }

    if (!response.ok) {
      return c.json(
        {
          error: `Chub download failed (HTTP ${response.status}). Try downloading the PNG manually and importing the file.`,
        },
        502,
      );
    }

    const buffer = new Uint8Array(await response.arrayBuffer());

    try {
      const card = extractCardFromPNG(buffer);
      const { character, duplicate } = await createCharacter(db, card, buffer);
      return c.json({ character, duplicate });
    } catch (err) {
      if (err instanceof CardParseError) {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }
  });

  // POST /:id/chat — create a new chat from this character
  app.post("/:id/chat", async (c) => {
    const characterId = c.req.param("id");
    const character = getCharacter(db, characterId);

    if (!character) {
      return c.json({ error: "Character not found" }, 404);
    }

    // Reuse or create ONE bot speaker per character.
    // This avoids duplicating avatar blobs across 50 chats with the same character.
    let botSpeakerId: string;
    const existingBot = db
      .query(
        "SELECT id FROM speakers WHERE character_id = $cid AND is_user = 0 LIMIT 1",
      )
      .get({ $cid: characterId }) as { id: string } | null;

    if (existingBot) {
      botSpeakerId = existingBot.id;
    } else {
      const botSpeaker = createSpeaker(db, {
        name: character.name,
        is_user: false,
        color: "#7c3aed",
      });
      botSpeakerId = botSpeaker.id;

      // Link speaker to character and copy avatar once
      db.query(
        "UPDATE speakers SET character_id = $cid WHERE id = $id",
      ).run({ $cid: characterId, $id: botSpeakerId });

      const avatarData = getCharacterAvatar(db, characterId);
      if (avatarData) {
        db.query(
          "UPDATE speakers SET avatar_blob = $blob, avatar_mime = $mime WHERE id = $id",
        ).run({
          $blob: avatarData.avatar,
          $mime: "image/png",
          $id: botSpeakerId,
        });
      }
    }

    // Reuse or create ONE user speaker (global singleton)
    const existingUser = db
      .query("SELECT id FROM speakers WHERE is_user = 1 LIMIT 1")
      .get() as { id: string } | null;

    let userSpeakerId: string;
    if (existingUser) {
      userSpeakerId = existingUser.id;
    } else {
      const userSpeaker = createSpeaker(db, {
        name: "User",
        is_user: true,
      });
      userSpeakerId = userSpeaker.id;
    }

    // Create the chat
    const chat = createChat(db, {
      name: character.name,
      speaker_ids: [userSpeakerId, botSpeakerId],
    });

    // Tag the chat with the character_id and apply the global persona if one is set
    const globalPersona = getGlobalPersona(db);
    db.query("UPDATE chats SET character_id = $cid WHERE id = $id").run({
      $cid: characterId,
      $id: chat.id,
    });
    if (globalPersona) {
      updateChat(db, chat.id, { persona_id: globalPersona.id });
    }

    // Insert the character's first message
    let rootNode = null;
    if (character.first_mes) {
      const result = addMessage(db, {
        chat_id: chat.id,
        parent_id: null,
        message: character.first_mes,
        speaker_id: botSpeakerId,
        is_bot: true,
      });
      rootNode = result.node;
    }

    // Fetch the updated chat to get root_node_id
    const updatedChat = getChat(db, chat.id);

    return c.json({
      chat: updatedChat ?? chat,
      root_node: rootNode,
      speakers: {
        user_id: userSpeakerId,
        bot_id: botSpeakerId,
      },
    });
  });

  // PATCH /:id — update character fields
  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ name?: string; description?: string; personality?: string; scenario?: string; first_mes?: string; mes_example?: string; creator_notes?: string; system_prompt?: string; post_history_instructions?: string; alternate_greetings?: string[]; tags?: string[]; creator?: string; character_version?: string }>();
    const updated = updateCharacter(db, id, body);
    if (!updated) return c.json({ error: "Character not found" }, 404);
    return c.json({ character: updated });
  });

  // POST /:id/avatar — upload or replace avatar image
  app.post("/:id/avatar", async (c) => {
    const id = c.req.param("id");
    const existing = getCharacter(db, id);
    if (!existing) return c.json({ error: "Character not found" }, 404);

    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return c.json({ error: "Expected multipart/form-data with a 'file' field" }, 400);
    }

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file provided. Include a 'file' field." }, 400);
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(buffer);
    const avatarHash = hasher.digest("hex");

    db.query(
      "UPDATE characters SET avatar = $avatar, avatar_hash = $hash, updated_at = $now WHERE id = $id",
    ).run({ $avatar: buffer, $hash: avatarHash, $now: Date.now(), $id: id });

    const updated = getCharacter(db, id);
    if (!updated) return c.json({ error: "Character not found" }, 404);
    return c.json({ character: updated });
  });

  // DELETE /:id — delete a character
  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    const deleted = deleteCharacter(db, id);
    if (!deleted) {
      return c.json({ error: "Character not found" }, 404);
    }
    return c.json({ ok: true });
  });

  return app;
}
