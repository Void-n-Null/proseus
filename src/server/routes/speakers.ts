import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import {
  createSpeaker,
  getSpeaker,
  listSpeakers,
  updateSpeaker,
  deleteSpeaker,
} from "../db/speakers.ts";

export function createSpeakersRouter(db: Database): Hono {
  const app = new Hono();

  // GET / — list all speakers
  app.get("/", (c) => {
    const speakers = listSpeakers(db);
    return c.json({ speakers });
  });

  // POST / — create a speaker
  app.post("/", async (c) => {
    const body = await c.req.json<{
      name?: string;
      is_user?: boolean;
      color?: string;
    }>();

    if (!body.name || typeof body.name !== "string") {
      return c.json({ error: "name is required" }, 400);
    }
    if (body.is_user === undefined || typeof body.is_user !== "boolean") {
      return c.json({ error: "is_user is required" }, 400);
    }

    const speaker = createSpeaker(db, {
      name: body.name,
      is_user: body.is_user,
      color: body.color,
    });

    return c.json({ speaker });
  });

  // GET /:id/avatar — serve speaker avatar image
  app.get("/:id/avatar", (c) => {
    const id = c.req.param("id");
    const row = db
      .query("SELECT avatar_blob, avatar_mime FROM speakers WHERE id = $id")
      .get({ $id: id }) as {
      avatar_blob: Uint8Array | null;
      avatar_mime: string | null;
    } | null;

    if (!row?.avatar_blob) {
      return c.json({ error: "Avatar not found" }, 404);
    }

    return new Response(row.avatar_blob as unknown as BodyInit, {
      headers: {
        "Content-Type": row.avatar_mime ?? "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  });

  // GET /:id — get single speaker
  app.get("/:id", (c) => {
    const id = c.req.param("id");
    const speaker = getSpeaker(db, id);
    if (!speaker) {
      return c.json({ error: "Speaker not found" }, 404);
    }

    return c.json({ speaker });
  });

  // PATCH /:id — update speaker
  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ name?: string; color?: string }>();

    const speaker = updateSpeaker(db, id, body);
    if (!speaker) {
      return c.json({ error: "Speaker not found" }, 404);
    }

    return c.json({ speaker });
  });

  // DELETE /:id — delete speaker
  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    const deleted = deleteSpeaker(db, id);
    if (!deleted) {
      return c.json({ error: "Speaker not found" }, 404);
    }

    return c.json({ ok: true });
  });

  return app;
}
