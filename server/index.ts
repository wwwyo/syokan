import { serve } from "bun";
import index from "../index.html";

const server = serve({
  routes: {
    "/": index,
    "/api/health": () => Response.json({ ok: true }),
  },
  development: process.env.NODE_ENV !== "production",
  port: Number(process.env.PORT ?? 5173),
});

console.log(`syokan listening on ${server.url}`);
