import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { serve } from "bun";
import {
  authFile,
  dataDir as resolveDataDir,
  legacyTemplatesDir,
  settingFile,
  templatesDir,
} from "../src/lib/paths";
import index from "../index.html";
// version is a compatibility marker so the CLI doesn't silently reuse a server from an old build.
import pkg from "../package.json";
import { createFileWatcher } from "./fileSource";
import {
  createApiHandlers,
  createFileHandlers,
  createProbeHandlers,
  createSettingHandlers,
  createTemplateHandlers,
  getCatalog,
} from "./routes";
import { createSettingStore } from "./setting";
import { createShareApp } from "./share";
import { shareApiOrigin } from "./shareService";
import { createSnapshotStore } from "./store";
import { createTemplateStore } from "./templates";

const DEFAULT_PORT = 5173;

function resolvePort(): number {
  const parsed = Number.parseInt(process.env.PORT ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

// The frontend is supplied via the index.html import. Dev gets an on-the-fly bundle + HMR;
// at compile time Bun bundles the frontend and embeds it in the same binary (the same static
// import serves both). Called from both entry.ts (the single binary) and direct startup.
// Migrate templates from the old layout to the new data home exactly once. If the destination
// already exists, it's already migrated or in active use, so leave it alone. Best-effort (startup continues even on failure).
function migrateLegacyTemplates(): void {
  const legacy = legacyTemplatesDir();
  const dest = templatesDir();
  if (legacy === dest || !existsSync(legacy) || existsSync(dest)) return;
  try {
    mkdirSync(dirname(dest), { recursive: true });
    renameSync(legacy, dest);
  } catch {
    // Swallowed: fresh operation still works even if the migration fails
  }
}

export function startServer() {
  migrateLegacyTemplates();
  const dataDir = resolveDataDir();
  const store = createSnapshotStore(dataDir);
  const api = createApiHandlers(store);
  const templates = createTemplateHandlers(createTemplateStore(templatesDir()));
  const setting = createSettingHandlers(createSettingStore(settingFile()));
  // File watching is connection-scoped runtime state, never persisted. It lives as long as the server.
  const file = createFileHandlers(createFileWatcher());
  const probe = createProbeHandlers();
  const shareApp = createShareApp({
    store,
    fetch: globalThis.fetch,
    origin: shareApiOrigin(),
    authFilePath: authFile(),
  });
  const share = (req: Request) => shareApp.fetch(req);
  const server = serve({
    routes: {
      "/api/health": () => Response.json({ ok: true, version: pkg.version }),
      // The catalog's SSOT is src/catalogs. The LLM pulls the props definitions from here.
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
      // public share: publish freezes a store snapshot and sends it to the Worker; auth
      // exchanges and holds the Worker token; shares is an authenticated proxy to the Worker.
      "/api/snapshots/:id/publish": { POST: share },
      "/api/auth/login": {
        GET: share,
        POST: share,
        DELETE: share,
      },
      "/api/shares": { GET: share },
      "/api/shares/:id": { DELETE: share },
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
      // File-reference node body read (GET) and change watching (SSE).
      "/api/files": { GET: file.readFile },
      "/api/files/watch": { GET: file.watchFile },
      // Probe: predefined read-only checks (run) and repo HEAD resolution (staleness).
      "/api/probes/run": { POST: probe.runProbe },
      "/api/probes/ref": { POST: probe.resolveRef },
      // Evaluated in static > param > wildcard order, so the APIs above take precedence.
      "/api/*": () => Response.json({ error: "not_found" }, { status: 404 }),
      // SPA fallback: non-API requests return the frontend, and the client router branches rendering.
      "/*": index,
    },
    development: process.env.NODE_ENV !== "production",
    port: resolvePort(),
    // Bind to localhost only, so /api/files (which reads arbitrary files) isn't exposed to the LAN
    // (PRD's trust boundary = localhost bind + user permissions).
    hostname: "127.0.0.1",
  });
  console.log(`syokan listening on ${server.url}`);
  console.log(`snapshot store: ${dataDir}`);
  return server;
}

if (import.meta.main) {
  startServer();
}
