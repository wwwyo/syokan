import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { serve } from "bun";
import {
  dataDir as resolveDataDir,
  legacyTemplatesDir,
  settingFile,
  templatesDir,
} from "@/lib/paths";
import index from "../index.html";
// version は CLI が「旧 build の server を黙って再利用しない」ための互換マーカー。
import pkg from "../package.json";
import { createFileWatcher } from "./fileSource";
import {
  createApiHandlers,
  createFileHandlers,
  createSettingHandlers,
  createTemplateHandlers,
  getCatalog,
} from "./routes";
import { createSettingStore } from "./setting";
import { createSnapshotStore } from "./store";
import { createTemplateStore } from "./templates";

const DEFAULT_PORT = 5173;

function resolvePort(): number {
  const parsed = Number.parseInt(process.env.PORT ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

// frontend は index.html の import で供給する。dev は on-the-fly bundle + HMR、
// compile 時は Bun が frontend を bundle して同じバイナリへ埋め込む (同一の静的
// import で両立する)。entry.ts (単体バイナリ) と直接起動の両方から呼ばれる。
// 旧レイアウトの templates を新 data home へ 1 回だけ引き継ぐ。移設先が既にあれば
// 移行済み or 現行運用中なので触らない。best-effort (失敗しても起動は続行する)。
function migrateLegacyTemplates(): void {
  const legacy = legacyTemplatesDir();
  const dest = templatesDir();
  if (legacy === dest || !existsSync(legacy) || existsSync(dest)) return;
  try {
    mkdirSync(dirname(dest), { recursive: true });
    renameSync(legacy, dest);
  } catch {
    // 移行に失敗しても新規運用は成立するので握る
  }
}

export function startServer() {
  migrateLegacyTemplates();
  const dataDir = resolveDataDir();
  const store = createSnapshotStore(dataDir);
  const api = createApiHandlers(store);
  const templates = createTemplateHandlers(createTemplateStore(templatesDir()));
  const setting = createSettingHandlers(createSettingStore(settingFile()));
  // file 監視は永続化しない接続スコープの runtime state。server 寿命と同じ生存。
  const file = createFileHandlers(createFileWatcher());
  const server = serve({
    routes: {
      "/api/health": () => Response.json({ ok: true, version: pkg.version }),
      // catalog は src/catalogs が SSOT。LLM は props 定義をここから引く。
      "/api/catalog": getCatalog,
      "/api/snapshots": {
        POST: api.createSnapshot,
        PUT: api.updateSnapshot,
        GET: api.listSnapshots,
      },
      "/api/snapshots/:id": {
        GET: api.getSnapshot,
        DELETE: api.deleteSnapshot,
      },
      "/api/templates": {
        GET: templates.listTemplates,
        POST: templates.createTemplate,
      },
      "/api/templates/:id": {
        GET: templates.getTemplate,
        DELETE: templates.deleteTemplate,
      },
      "/api/settings": {
        GET: setting.getSetting,
        PUT: setting.updateSetting,
      },
      // ファイル参照ノードの本文読み出し (GET) と変更監視 (SSE)。
      "/api/files": { GET: file.readFile },
      "/api/files/watch": { GET: file.watchFile },
      // static > param > wildcard 順で評価されるので上の API が優先される。
      "/api/*": () => Response.json({ error: "not_found" }, { status: 404 }),
      // SPA fallback: API 以外は frontend を返し、client router が描画を分岐する。
      "/*": index,
    },
    development: process.env.NODE_ENV !== "production",
    port: resolvePort(),
    // localhost のみに bind する。任意ファイルを読む /api/files を LAN に晒さないため
    // (PRD の信頼境界 = localhost bind ＋ ユーザー権限)。
    hostname: "127.0.0.1",
  });
  console.log(`syokan listening on ${server.url}`);
  console.log(`snapshot store: ${dataDir}`);
  return server;
}

if (import.meta.main) {
  startServer();
}
