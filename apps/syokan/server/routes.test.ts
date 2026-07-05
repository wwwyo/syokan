import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileWatcher } from "./fileSource";
import {
  createApiHandlers,
  createFileHandlers,
  createSettingHandlers,
  createTemplateHandlers,
  getCatalog,
} from "./routes";
import { createSettingStore } from "./setting";
import { createSnapshotStore, type SnapshotStore } from "./store";
import { createTemplateStore } from "./templates";

const baseInput = {
  root: {
    type: "Stack",
    props: {},
    children: [{ type: "Heading", props: { text: "S1" } }],
  },
} as const;

function makeRequest(url: string, init?: RequestInit) {
  return new Request(`http://test${url}`, init);
}

function makeParamRequest(url: string, params: Record<string, string>) {
  const req = new Request(`http://test${url}`) as Request & {
    params: Record<string, string>;
  };
  Object.defineProperty(req, "params", { value: params });
  return req;
}

describe("api routes", () => {
  let dir: string;
  let store: SnapshotStore;
  let api: ReturnType<typeof createApiHandlers>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "syokan-api-"));
    store = createSnapshotStore(dir);
    api = createApiHandlers(store);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("POST /api/snapshots accepts a valid envelope and returns id + url", async () => {
    const res = await api.createSnapshot(
      makeRequest("/api/snapshots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Sample",
          root: baseInput.root,
        }),
      }),
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { id: string; url: string };
    expect(data.id).toMatch(/[0-9a-f-]{36}/);
    expect(data.url).toBe(`/snapshots/${data.id}`);
  });

  test("POST /api/snapshots returns 400 with issues on invalid root", async () => {
    const res = await api.createSnapshot(
      makeRequest("/api/snapshots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ root: { type: "Bogus", props: {} } }),
      }),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    const data = (await res.json()) as {
      error: string;
      issues: Array<{ path: (string | number)[] }>;
    };
    expect(data.error).toBe("validation_failed");
    expect(Array.isArray(data.issues)).toBe(true);
    expect(data.issues.length).toBeGreaterThan(0);
  });

  test("POST /api/snapshots returns 400 for non-JSON body", async () => {
    const res = await api.createSnapshot(
      makeRequest("/api/snapshots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("invalid_json");
  });

  test("POST /api/snapshots: required props missing -> 400 with path + expected", async () => {
    const res = await api.createSnapshot(
      makeRequest("/api/snapshots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          root: { type: "Heading", props: {} },
        }),
      }),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as {
      issues: Array<{ path: (string | number)[]; expected?: string }>;
    };
    const textIssue = data.issues.find(
      (i) => i.path.includes("text") && i.path.includes("props"),
    );
    expect(textIssue).toBeDefined();
  });

  test("GET /api/snapshots/:id returns the snapshot after POST", async () => {
    const post = await api.createSnapshot(
      makeRequest("/api/snapshots", {
        method: "POST",
        body: JSON.stringify({ root: baseInput.root }),
      }),
    );
    const { id } = (await post.json()) as { id: string };

    const get = await api.getSnapshot(
      makeParamRequest(`/api/snapshots/${id}`, { id }) as never,
    );
    expect(get.status).toBe(200);
    const env = (await get.json()) as { id: string; root: { type: string } };
    expect(env.id).toBe(id);
    expect(env.root.type).toBe("Stack");
  });

  test("GET /api/snapshots/:id returns 404 for unknown id", async () => {
    const res = await api.getSnapshot(
      makeParamRequest("/api/snapshots/missing", { id: "missing" }) as never,
    );
    expect(res.status).toBe(404);
  });

  test("GET /api/snapshots/:id returns 404 for prototype-chain ids (no proto leak)", async () => {
    for (const id of ["constructor", "toString", "__proto__"]) {
      const res = await api.getSnapshot(
        makeParamRequest(`/api/snapshots/${id}`, { id }) as never,
      );
      expect(res.status).toBe(404);
    }
  });

  test("DELETE /api/snapshots/:id returns 404 for prototype-chain ids", async () => {
    const res = await api.deleteSnapshot(
      makeParamRequest("/api/snapshots/constructor", { id: "constructor" }) as never,
    );
    expect(res.status).toBe(404);
  });

  test("server restart simulation: new store sees previously-created snapshots", async () => {
    const post = await api.createSnapshot(
      makeRequest("/api/snapshots", {
        method: "POST",
        body: JSON.stringify({ root: baseInput.root }),
      }),
    );
    const { id } = (await post.json()) as { id: string };

    // simulate a fresh process by constructing a new store over the same dir
    const next = createSnapshotStore(dir);
    const nextApi = createApiHandlers(next);
    const res = await nextApi.getSnapshot(
      makeParamRequest(`/api/snapshots/${id}`, { id }) as never,
    );
    expect(res.status).toBe(200);
  });

  test("PUT /api/snapshots: an unseen idempotencyKey is a 404 not_found (no allow_missing escape hatch)", async () => {
    const res = await api.updateSnapshot(
      makeRequest("/api/snapshots", {
        method: "PUT",
        body: JSON.stringify({
          root: baseInput.root,
          idempotencyKey: "never-posted",
        }),
      }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });

  test("POST with idempotencyKey creates (201) and registers the key for later PUT", async () => {
    const first = await api.createSnapshot(
      makeRequest("/api/snapshots", {
        method: "POST",
        body: JSON.stringify({
          root: baseInput.root,
          idempotencyKey: "fixed",
        }),
      }),
    );
    expect(first.status).toBe(201);
    const a = (await first.json()) as { id: string };
    const second = await api.updateSnapshot(
      makeRequest("/api/snapshots", {
        method: "PUT",
        body: JSON.stringify({
          root: baseInput.root,
          idempotencyKey: "fixed",
        }),
      }),
    );
    expect(second.status).toBe(200);
    const b = (await second.json()) as { id: string };
    expect(b.id).toBe(a.id);
  });

  test("POST with different idempotencyKeys produces different ids", async () => {
    const first = await api.createSnapshot(
      makeRequest("/api/snapshots", {
        method: "POST",
        body: JSON.stringify({
          root: baseInput.root,
          idempotencyKey: "k1",
        }),
      }),
    );
    const a = (await first.json()) as { id: string };
    const second = await api.createSnapshot(
      makeRequest("/api/snapshots", {
        method: "POST",
        body: JSON.stringify({
          root: baseInput.root,
          idempotencyKey: "k2",
        }),
      }),
    );
    const b = (await second.json()) as { id: string };
    expect(b.id).not.toBe(a.id);
  });

  test("PUT replaces content in place via the API (200, same id)", async () => {
    const first = await api.createSnapshot(
      makeRequest("/api/snapshots", {
        method: "POST",
        body: JSON.stringify({
          root: baseInput.root,
          title: "Day 1",
          idempotencyKey: "recurring-api",
        }),
      }),
    );
    const a = (await first.json()) as { id: string };
    const second = await api.updateSnapshot(
      makeRequest("/api/snapshots", {
        method: "PUT",
        body: JSON.stringify({
          root: { type: "Heading", props: { text: "Day 2" } },
          title: "Day 2",
          idempotencyKey: "recurring-api",
        }),
      }),
    );
    expect(second.status).toBe(200);
    const b = (await second.json()) as {
      id: string;
      snapshot: { title?: string; root: { type: string } };
    };
    expect(b.id).toBe(a.id);
    expect(b.snapshot.title).toBe("Day 2");
    expect(b.snapshot.root.type).toBe("Heading");
  });

  test("PUT /api/snapshots: idempotencyKey is required (missing -> 400 validation_failed)", async () => {
    const res = await api.updateSnapshot(
      makeRequest("/api/snapshots", {
        method: "PUT",
        body: JSON.stringify({ root: baseInput.root }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation_failed");
  });

  test("PUT /api/snapshots: unknown top-level keys are rejected (putInputSchema stays strict after .extend())", async () => {
    const res = await api.updateSnapshot(
      makeRequest("/api/snapshots", {
        method: "PUT",
        body: JSON.stringify({
          root: baseInput.root,
          idempotencyKey: "strict-check",
          unexpected: "nope",
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation_failed");
  });

  test("idempotencyKey: omitting it always creates a new id", async () => {
    const r1 = await api.createSnapshot(
      makeRequest("/api/snapshots", {
        method: "POST",
        body: JSON.stringify({ root: baseInput.root }),
      }),
    );
    const r2 = await api.createSnapshot(
      makeRequest("/api/snapshots", {
        method: "POST",
        body: JSON.stringify({ root: baseInput.root }),
      }),
    );
    const a = (await r1.json()) as { id: string };
    const b = (await r2.json()) as { id: string };
    expect(b.id).not.toBe(a.id);
  });

  test("GET /api/snapshots lists id/title/createdAt", async () => {
    await api.createSnapshot(
      makeRequest("/api/snapshots", {
        method: "POST",
        body: JSON.stringify({ root: baseInput.root, title: "A" }),
      }),
    );
    await api.createSnapshot(
      makeRequest("/api/snapshots", {
        method: "POST",
        body: JSON.stringify({ root: baseInput.root, title: "B" }),
      }),
    );
    const res = await api.listSnapshots();
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      items: Array<{ id: string; title?: string; createdAt: string }>;
    };
    expect(data.items.length).toBe(2);
    expect(data.items.every((i) => typeof i.id === "string")).toBe(true);
    expect(data.items.every((i) => typeof i.createdAt === "string")).toBe(true);
    expect(data.items.map((i) => i.title).sort()).toEqual(["A", "B"]);
  });

  test("GET /api/snapshots returns empty array when store is empty", async () => {
    const res = await api.listSnapshots();
    const data = (await res.json()) as { items: unknown[] };
    expect(data.items).toEqual([]);
  });

  test("DELETE /api/snapshots/:id removes the snapshot; subsequent GET returns 404", async () => {
    const post = await api.createSnapshot(
      makeRequest("/api/snapshots", {
        method: "POST",
        body: JSON.stringify({ root: baseInput.root }),
      }),
    );
    const { id } = (await post.json()) as { id: string };
    const del = await api.deleteSnapshot(
      makeParamRequest(`/api/snapshots/${id}`, { id }) as never,
    );
    expect(del.status).toBe(200);
    const get = await api.getSnapshot(
      makeParamRequest(`/api/snapshots/${id}`, { id }) as never,
    );
    expect(get.status).toBe(404);
  });

  test("DELETE /api/snapshots/:id returns 404 for unknown id", async () => {
    const del = await api.deleteSnapshot(
      makeParamRequest("/api/snapshots/missing", { id: "missing" }) as never,
    );
    expect(del.status).toBe(404);
  });

  test("POST /api/snapshots: unknown component type response is JSON with content-type", async () => {
    const res = await api.createSnapshot(
      makeRequest("/api/snapshots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ root: { type: "Bogus", props: {} } }),
      }),
    );
    expect(res.headers.get("content-type")).toContain("application/json");
    const data = (await res.json()) as {
      issues: Array<{ path: (string | number)[] }>;
    };
    // root.type should be a key path
    const typeIssue = data.issues.find(
      (i) => i.path.includes("root") && i.path.includes("type"),
    );
    expect(typeIssue).toBeDefined();
  });
});

describe("GET /api/catalog", () => {
  test("returns the catalog manifest derived from src/catalogs", async () => {
    const res = getCatalog();
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      items: Array<{ type: string; props: unknown; childrenTypes: unknown }>;
    };
    const types = data.items.map((i) => i.type);
    expect(types).toContain("Stack");
    expect(types).toContain("Heading");
    const heading = data.items.find((i) => i.type === "Heading");
    expect((heading?.props as { type?: string }).type).toBe("object");
    expect(heading?.childrenTypes).toEqual([]);
  });
});

describe("template routes", () => {
  let dir: string;
  let templates: ReturnType<typeof createTemplateHandlers>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "syokan-tmpl-api-"));
    templates = createTemplateHandlers(createTemplateStore(dir));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("POST creates a template and returns id; GET round-trips it", async () => {
    const post = await templates.createTemplate(
      makeRequest("/api/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "RSS",
          description: "daily feed",
          json: { root: { type: "Stack", props: {} } },
        }),
      }),
    );
    expect(post.status).toBe(201);
    const { id } = (await post.json()) as { id: string };
    expect(id).toMatch(/[0-9a-f-]{36}/);

    const get = await templates.getTemplate(
      makeParamRequest(`/api/templates/${id}`, { id }) as never,
    );
    expect(get.status).toBe(200);
    const t = (await get.json()) as { title: string; json: unknown };
    expect(t.title).toBe("RSS");
    expect(t.json).toEqual({ root: { type: "Stack", props: {} } });
  });

  test("POST returns 400 when title is missing", async () => {
    const res = await templates.createTemplate(
      makeRequest("/api/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { a: 1 } }),
      }),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("validation_failed");
  });

  test("POST returns 400 when json is null", async () => {
    const res = await templates.createTemplate(
      makeRequest("/api/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "x", json: null }),
      }),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("validation_failed");
  });

  test("GET list returns summaries without json", async () => {
    await templates.createTemplate(
      makeRequest("/api/templates", {
        method: "POST",
        body: JSON.stringify({ title: "A", json: { a: 1 } }),
      }),
    );
    const res = await templates.listTemplates();
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      items: Array<{ title: string; json?: unknown }>;
    };
    expect(data.items.length).toBe(1);
    expect(data.items[0]?.json).toBeUndefined();
  });

  test("GET unknown id returns 404", async () => {
    const res = await templates.getTemplate(
      makeParamRequest("/api/templates/missing", { id: "missing" }) as never,
    );
    expect(res.status).toBe(404);
  });

  test("DELETE removes the template; subsequent GET returns 404", async () => {
    const post = await templates.createTemplate(
      makeRequest("/api/templates", {
        method: "POST",
        body: JSON.stringify({ title: "X", json: {} }),
      }),
    );
    const { id } = (await post.json()) as { id: string };
    const del = await templates.deleteTemplate(
      makeParamRequest(`/api/templates/${id}`, { id }) as never,
    );
    expect(del.status).toBe(200);
    const get = await templates.getTemplate(
      makeParamRequest(`/api/templates/${id}`, { id }) as never,
    );
    expect(get.status).toBe(404);
  });
});

describe("setting routes", () => {
  let dir: string;
  let setting: ReturnType<typeof createSettingHandlers>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "syokan-setting-api-"));
    setting = createSettingHandlers(
      createSettingStore(join(dir, "settings.json")),
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("GET returns defaults before anything is written", async () => {
    const res = await setting.getSetting();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ theme: "system", font: "system" });
  });

  test("PUT applies a partial patch and GET reflects it", async () => {
    const put = await setting.updateSetting(
      makeRequest("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme: "dark" }),
      }),
    );
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ theme: "dark", font: "system" });

    const get = await setting.getSetting();
    expect(await get.json()).toEqual({ theme: "dark", font: "system" });
  });

  test("PUT returns 400 on unknown key", async () => {
    const res = await setting.updateSetting(
      makeRequest("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bogus: 1 }),
      }),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("validation_failed");
  });

  test("PUT returns 400 on invalid enum value", async () => {
    const res = await setting.updateSetting(
      makeRequest("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme: "neon" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("PUT accepts a known font preset", async () => {
    const res = await setting.updateSetting(
      makeRequest("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ font: "inter" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ theme: "system", font: "inter" });
  });

  test("PUT returns 400 on a syntactically-valid but unknown font", async () => {
    const res = await setting.updateSetting(
      makeRequest("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ font: "does-not-exist" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("PUT returns 400 for non-JSON body", async () => {
    const res = await setting.updateSetting(
      makeRequest("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("invalid_json");
  });
});

describe("file routes", () => {
  let fileDir: string;
  let watcher: ReturnType<typeof createFileWatcher>;
  let file: ReturnType<typeof createFileHandlers>;

  beforeEach(async () => {
    fileDir = await mkdtemp(join(tmpdir(), "syokan-files-"));
    watcher = createFileWatcher({ releaseDelayMs: 20, notifyDebounceMs: 5 });
    file = createFileHandlers(watcher);
  });

  afterEach(async () => {
    watcher.closeAll();
    await rm(fileDir, { recursive: true, force: true });
  });

  test("GET /api/files returns the content of a text file", async () => {
    const p = join(fileDir, "a.md");
    await writeFile(p, "# hi");
    const res = await file.readFile(
      makeRequest(`/api/files?path=${encodeURIComponent(p)}`),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ content: "# hi" });
  });

  test("GET /api/files without path → 400", async () => {
    const res = await file.readFile(makeRequest("/api/files"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("missing_path");
  });

  test("GET /api/files with a relative path → 400 invalid_path", async () => {
    const res = await file.readFile(
      makeRequest(`/api/files?path=${encodeURIComponent("relative/notes.md")}`),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_path");
  });

  test("GET /api/files for a missing file → 404 not_found", async () => {
    const res = await file.readFile(
      makeRequest(`/api/files?path=${encodeURIComponent(join(fileDir, "x"))}`),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });

  test("GET /api/files/watch emits an SSE stream and releases on cancel", async () => {
    const p = join(fileDir, "w.txt");
    await writeFile(p, "v1");
    const res = file.watchFile(
      makeRequest(`/api/files/watch?path=${encodeURIComponent(p)}`),
    );
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = res.body!.getReader();
    // Receive the comment line sent right after connecting.
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain(": connected");
    expect(watcher.activeCount()).toBe(1);
    // Client disconnect = stream cancel → unsubscribe.
    await reader.cancel();
    await new Promise((r) => setTimeout(r, 40));
    expect(watcher.activeCount()).toBe(0);
  });

  test("GET /api/files/watch without path → 400", async () => {
    const res = file.watchFile(makeRequest("/api/files/watch"));
    expect(res.status).toBe(400);
  });
});
