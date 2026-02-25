import { Hono } from "hono";
import db from "./db/index.ts";
import { createChatsRouter } from "./routes/chats.ts";
import { createSpeakersRouter } from "./routes/speakers.ts";
import { createCharactersRouter } from "./routes/characters.ts";
import { createConnectionsRouter } from "./routes/connections.ts";
import { createSettingsRouter } from "./routes/settings.ts";
import { createPersonasRouter } from "./routes/personas.ts";
import { createUsageRouter } from "./routes/usage.ts";

const api = new Hono().basePath("/api");

// ── Global error handler ───────────────────────────────────────
// Catches unhandled errors (e.g. malformed JSON bodies, unexpected
// throws) and returns a clean JSON response without stack traces.
api.onError((err, c) => {
  if (err instanceof SyntaxError) {
    return c.json({ error: "Malformed request body" }, 400);
  }
  console.error("[api] Unhandled error:", err);
  const message =
    err instanceof Error ? err.message : "Internal server error";
  return c.json({ error: message }, 500);
});

api.route("/chats", createChatsRouter(db));
api.route("/speakers", createSpeakersRouter(db));
api.route("/characters", createCharactersRouter(db));
api.route("/connections", createConnectionsRouter(db));
api.route("/settings", createSettingsRouter(db));
api.route("/personas", createPersonasRouter(db));
api.route("/usage", createUsageRouter(db));

export default api;
