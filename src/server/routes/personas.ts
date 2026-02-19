import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import { parseSizeParam, resizeAvatar } from "../lib/thumbnail.ts";
import {
  listPersonas,
  getPersona,
  getPersonaAvatar,
  createPersona,
  updatePersona,
  setPersonaAvatar,
  deletePersona,
} from "../db/personas.ts";
import { updateChat } from "../db/chats.ts";

export function createPersonasRouter(db: Database): Hono {
  const app = new Hono();

  // GET / — list all personas
  app.get("/", (c) => {
    const personas = listPersonas(db);
    return c.json({ personas });
  });

  // GET /:id — single persona
  app.get("/:id", (c) => {
    const id = c.req.param("id");
    const persona = getPersona(db, id);
    if (!persona) return c.json({ error: "Persona not found" }, 404);
    return c.json({ persona });
  });

  // GET /:id/avatar — serve avatar with ETag caching (optional ?size= thumbnail)
  app.get("/:id/avatar", async (c) => {
    const id = c.req.param("id");
    const result = getPersonaAvatar(db, id);
    if (!result) return c.json({ error: "Avatar not found" }, 404);

    const size = parseSizeParam(c.req.query("size"));
    const { buffer, mime } = await resizeAvatar(
      result.avatar,
      result.mime,
      size,
      `persona-${id}`,
    );

    const ifNoneMatch = c.req.header("If-None-Match");
    const etag = `"persona-${id}-${size ?? "full"}"`;
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

  // POST / — create a persona
  app.post("/", async (c) => {
    const body = await c.req.json<{
      name?: string;
      prompt?: string;
      is_global?: boolean;
    }>();

    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return c.json({ error: "name is required" }, 400);
    }

    const persona = createPersona(db, {
      name: body.name.trim(),
      prompt: body.prompt ?? "",
      is_global: body.is_global ?? false,
    });

    return c.json({ persona }, 201);
  });

  // PATCH /:id — update name / prompt / is_global
  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{
      name?: string;
      prompt?: string;
      is_global?: boolean;
    }>();

    const persona = updatePersona(db, id, body);
    if (!persona) return c.json({ error: "Persona not found" }, 404);
    return c.json({ persona });
  });

  // POST /:id/avatar — upload avatar image
  app.post("/:id/avatar", async (c) => {
    const id = c.req.param("id");

    if (!getPersona(db, id)) {
      return c.json({ error: "Persona not found" }, 404);
    }

    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return c.json({ error: "Expected multipart/form-data with a 'file' field" }, 400);
    }

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file provided" }, 400);
    }

    const validMimes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!validMimes.includes(file.type)) {
      return c.json({ error: "Avatar must be a PNG, JPEG, WebP, or GIF" }, 400);
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const ok = setPersonaAvatar(db, id, buffer, file.type);
    if (!ok) return c.json({ error: "Failed to save avatar" }, 500);

    const persona = getPersona(db, id);
    return c.json({ persona });
  });

  // DELETE /:id — delete a persona
  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    const deleted = deletePersona(db, id);
    if (!deleted) return c.json({ error: "Persona not found" }, 404);
    return c.json({ ok: true });
  });

  // PUT /chats/:chatId/persona — assign or clear persona for a chat
  app.put("/chats/:chatId/persona", async (c) => {
    const chatId = c.req.param("chatId");
    const body = await c.req.json<{ persona_id: string | null }>();

    if (body.persona_id !== null && typeof body.persona_id !== "string") {
      return c.json({ error: "persona_id must be a string or null" }, 400);
    }

    const chat = updateChat(db, chatId, { persona_id: body.persona_id ?? null });
    if (!chat) return c.json({ error: "Chat not found" }, 404);

    return c.json({ chat });
  });

  return app;
}
