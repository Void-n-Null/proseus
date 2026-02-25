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

api.route("/chats", createChatsRouter(db));
api.route("/speakers", createSpeakersRouter(db));
api.route("/characters", createCharactersRouter(db));
api.route("/connections", createConnectionsRouter(db));
api.route("/settings", createSettingsRouter(db));
api.route("/personas", createPersonasRouter(db));
api.route("/usage", createUsageRouter(db));

export default api;
