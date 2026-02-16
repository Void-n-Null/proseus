import index from "../client/index.html";
import api from "./api.ts";

const server = Bun.serve({
  port: 3000,
  routes: {
    "/": index,
  },
  fetch: api.fetch,
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Proseus running at http://localhost:${server.port}`);
