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
