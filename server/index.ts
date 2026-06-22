import { homedir } from "node:os";
import { join } from "node:path";
import { serve } from "bun";
import index from "../index.html";
import { createApiHandlers } from "./routes";
import { SnapshotStore } from "./store";

const DEFAULT_PORT = 5173;

function resolvePort(): number {
  const parsed = Number.parseInt(process.env.PORT ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

// cwd 相対だと起動した dir 次第で store が分裂する (lazy-spawn は任意の cwd から
// server を起こすため)。安定した per-user の場所を既定にして起動経路間で揃える。
function resolveDataDir(): string {
  return process.env.SYOKAN_DATA_DIR ?? join(homedir(), ".syokan", "data");
}

// frontend は index.html の import で供給する。dev は on-the-fly bundle + HMR、
// compile 時は Bun が frontend を bundle して同じバイナリへ埋め込む (同一の静的
// import で両立する)。entry.ts (単体バイナリ) と直接起動の両方から呼ばれる。
export function startServer() {
  const dataDir = resolveDataDir();
  const store = new SnapshotStore(dataDir);
  const api = createApiHandlers(store);
  const server = serve({
    routes: {
      "/api/health": () => Response.json({ ok: true }),
      "/api/snapshots": {
        POST: api.createSnapshot,
        GET: api.listSnapshots,
      },
      "/api/snapshots/:id": {
        GET: api.getSnapshot,
        DELETE: api.deleteSnapshot,
      },
      // static > param > wildcard 順で評価されるので上の API が優先される。
      "/api/*": () => Response.json({ error: "not_found" }, { status: 404 }),
      // SPA fallback: API 以外は frontend を返し、client router が描画を分岐する。
      "/*": index,
    },
    development: process.env.NODE_ENV !== "production",
    port: resolvePort(),
  });
  console.log(`syokan listening on ${server.url}`);
  console.log(`snapshot store: ${dataDir}`);
  return server;
}

if (import.meta.main) {
  startServer();
}
