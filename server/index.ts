import { homedir } from "node:os";
import { join } from "node:path";
import { serve } from "bun";
import index from "../index.html";
import { createApiHandlers } from "./routes";
import { SnapshotStore } from "./store";

const DEFAULT_PORT = 5173;
const parsedPort = Number.parseInt(process.env.PORT ?? "", 10);
const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT;

// cwd 相対だと起動した dir 次第で store が分裂する (lazy-spawn は任意の cwd から
// server を起こすため)。安定した per-user の場所を既定にして起動経路間で揃える。
const dataDir =
  process.env.SYOKAN_DATA_DIR ?? join(homedir(), ".syokan", "data");
const store = new SnapshotStore(dataDir);
const api = createApiHandlers(store);

const server = serve({
  routes: {
    // liveness probe
    "/api/health": () => Response.json({ ok: true }),
    // snapshot リソース (作成 / 一覧 / 取得 / 削除) を 1 パスに統一。
    "/api/snapshots": {
      POST: api.createSnapshot,
      GET: api.listSnapshots,
    },
    "/api/snapshots/:id": {
      GET: api.getSnapshot,
      DELETE: api.deleteSnapshot,
    },
    // 未知の API は HTML ではなく JSON 404 を返す (client routing の SPA fallback に
    // 落とさない)。static > param > wildcard の順で評価されるので上記が優先される。
    "/api/*": () =>
      Response.json({ error: "not_found" }, { status: 404 }),
    // SPA fallback: API 以外の任意パスは同じ HTML を返し、client router が描画を分岐する。
    "/*": index,
  },
  development: process.env.NODE_ENV !== "production",
  port,
});

console.log(`syokan listening on ${server.url}`);
console.log(`snapshot store: ${dataDir}`);
