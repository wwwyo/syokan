import { serve } from "bun";
import index from "../index.html";

const DEFAULT_PORT = 5173;
const parsedPort = Number.parseInt(process.env.PORT ?? "", 10);
const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT;

const server = serve({
  routes: {
    "/": index,
    "/api/health": () => Response.json({ ok: true }),
  },
  development: process.env.NODE_ENV !== "production",
  port,
});

console.log(`syokan listening on ${server.url}`);
