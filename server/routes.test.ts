import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiHandlers } from "./routes";
import { SnapshotStore } from "./store";

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
    store = new SnapshotStore(dir);
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
    const next = new SnapshotStore(dir);
    const nextApi = createApiHandlers(next);
    const res = await nextApi.getSnapshot(
      makeParamRequest(`/api/snapshots/${id}`, { id }) as never,
    );
    expect(res.status).toBe(200);
  });

  test("idempotencyKey: same key replays the same id", async () => {
    const first = await api.createSnapshot(
      makeRequest("/api/snapshots", {
        method: "POST",
        body: JSON.stringify({
          root: baseInput.root,
          idempotencyKey: "fixed",
        }),
      }),
    );
    const a = (await first.json()) as { id: string };
    const second = await api.createSnapshot(
      makeRequest("/api/snapshots", {
        method: "POST",
        body: JSON.stringify({
          root: baseInput.root,
          idempotencyKey: "fixed",
        }),
      }),
    );
    const b = (await second.json()) as { id: string };
    expect(b.id).toBe(a.id);
  });

  test("idempotencyKey: different keys produce different ids", async () => {
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
