import index from "../client/index.html";
import api from "./api.ts";
import db, { initDatabase } from "./db/index.ts";
import type { WsContext } from "../shared/ws-types.ts";
import { StreamManager } from "./services/stream-manager.ts";
import { createWebSocketHandler } from "./ws.ts";

// Initialize encryption key and migrate any plaintext API keys
await initDatabase(db);

const streamManager = new StreamManager(db);

const server = Bun.serve<WsContext>({
  port: 3000,
  routes: {
    // SPA routes — all serve the same HTML shell, client-side routing
    // picks the view based on the URL path.
    "/": index,
    "/chat/:id": index,
  },
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade for /ws
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req, {
        data: { subscribedChats: new Set<string>() },
      });
      if (upgraded) return;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Everything else goes to Hono (API routes)
    return api.fetch(req);
  },
  websocket: createWebSocketHandler(streamManager),
  development: {
    hmr: true,
    console: true,
  },
});

// Stream manager needs the server instance for pub/sub broadcasting
streamManager.setServer(server);

console.log(`Proseus running at http://localhost:${server.port}`);
