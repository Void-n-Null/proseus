import index from "../client/index.html";
import api from "./api.ts";
import db, { initDatabase } from "./db/index.ts";
import type { WsContext } from "../shared/ws-types.ts";
import { StreamManager } from "./services/stream-manager.ts";
import { createWebSocketHandler } from "./ws.ts";
import { networkInterfaces } from "os";
import figlet from "figlet";

// Runtime flags
const isDev = process.env.NODE_ENV !== "production";
const isLan = process.argv.includes("--lan");
const port = Number.parseInt(process.env.PORT ?? "8075", 10);

// Initialize encryption key and migrate any plaintext API keys
await initDatabase(db);

const streamManager = new StreamManager(db);

const server = Bun.serve<WsContext>({
  port,
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

// Startup banner
const cyan = "\x1b[36m";
const dim = "\x1b[2m";
const bold = "\x1b[1m";
const reset = "\x1b[0m";
const white = "\x1b[37m";

const cols = process.stdout.columns ?? 80;
const fonts = ["ANSI Shadow", "Pagga"] as const;
const fit = fonts.find((font) => {
  const width = Math.max(...figlet.textSync("PROSEUS", { font }).split("\n").map((l) => l.length));
  return width <= cols;
});
const banner = fit
  ? `${cyan}${figlet.textSync("PROSEUS", { font: fit })}${reset}`
  : `${cyan}${bold}PROSEUS${reset}`;

const mode = isDev ? `${dim}dev${reset}` : `${bold}production${reset}`;
const url = `${white}http://localhost:${server.port}${reset}`;

console.log(banner);
console.log(`  ${mode} · ${url}`);

if (isLan) {
  const lanAddress = Object.values(networkInterfaces())
    .flat()
    .find((i) => i?.family === "IPv4" && !i?.internal)?.address;
  if (lanAddress)
    console.log(`  ${dim}LAN${reset}  · ${white}http://${lanAddress}:${server.port}${reset}`);
} else if (isDev) {
  console.log(`  ${dim}pass --lan to expose on your local network${reset}`);
}
console.log();
