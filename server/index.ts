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
    // SPA: home と view page は同じ HTML を返し、client が pathname を見て描画を分岐する。
    // trailing slash 有無の両方を受ける (client の matchViewId は両形を受理するため)
    "/": index,
    "/views/:id": index,
    "/views/:id/": index,
    // liveness probe
    "/api/health": () => Response.json({ ok: true }),
    // snapshot を新規作成し id / view URL を返す
    "/api/items": {
      POST: api.postItems,
    },
    // snapshot 一覧 (id / title / createdAt / source.label)
    "/api/views": {
      GET: api.listViews,
    },
    // 単一 snapshot の取得 / 削除
    "/api/views/:id": {
      GET: api.getView,
      DELETE: api.deleteView,
    },
  },
  development: process.env.NODE_ENV !== "production",
  port,
});

console.log(`syokan listening on ${server.url}`);
console.log(`snapshot store: ${dataDir}`);
