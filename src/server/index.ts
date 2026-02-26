import index from "../client/index.html";
import api from "./api.ts";
import db, { initDatabase } from "./db/index.ts";
import type { WsContext } from "../shared/ws-types.ts";
import { StreamManager } from "./services/stream-manager.ts";
import { createWebSocketHandler } from "./ws.ts";
import { networkInterfaces } from "os";

// Runtime flags
const isDev = process.env.NODE_ENV !== "production";
const isLan = process.argv.includes("--lan");

// Initialize encryption key and migrate any plaintext API keys
await initDatabase(db);

const streamManager = new StreamManager(db);

const server = Bun.serve<WsContext>({
  port: 8075,
  hostname: isLan ? "0.0.0.0" : "127.0.0.1",
  routes: {
    "/": index,
    "/chat/:id": index,
    "/icons/:file": async (req: Request & { params: { file: string } }) => {
      const file = Bun.file(`icons/${req.params.file}`);
      if (await file.exists()) {
        return new Response(file, {
          headers: {
            "Content-Type": "image/svg+xml",
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
      return new Response("Not found", { status: 404 });
    },
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
  ...(isDev ? { development: { hmr: true, console: true } } : {}),
});

// Stream manager needs the server instance for pub/sub broadcasting
streamManager.setServer(server);

const mode = isDev ? "dev" : "production";
console.log(`Proseus (${mode}) running at http://localhost:${server.port}`);

if (isLan) {
  const lanAddress = Object.values(networkInterfaces())
    .flat()
    .find((i) => i?.family === "IPv4" && !i?.internal)?.address;
  if (lanAddress) console.log(`  LAN: http://${lanAddress}:${server.port}`);
} else if (isDev) {
  console.log("  Pass --lan to expose on your local network");
}
