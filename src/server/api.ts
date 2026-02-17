import { Hono } from "hono";
import db from "./db/index.ts";
import { createChatsRouter } from "./routes/chats.ts";
import { createSpeakersRouter } from "./routes/speakers.ts";
import { createCharactersRouter } from "./routes/characters.ts";

const api = new Hono().basePath("/api");

api.route("/chats", createChatsRouter(db));
api.route("/speakers", createSpeakersRouter(db));
api.route("/characters", createCharactersRouter(db));

// Dev-only routes
api.post("/dev/seed", async (c) => {
  const { seedDatabase } = await import("./db/seed.ts");
  seedDatabase(db);
  return c.json({ ok: true });
});

api.post("/dev/reset", async (c) => {
  // Drop all data and re-seed
  db.exec("DELETE FROM chat_nodes");
  db.exec("DELETE FROM chat_speakers");
  db.exec("DELETE FROM chats");
  db.exec("DELETE FROM speakers");
  db.exec("DELETE FROM characters");
  const { seedDatabase } = await import("./db/seed.ts");
  seedDatabase(db);
  return c.json({ ok: true });
});

export default api;
