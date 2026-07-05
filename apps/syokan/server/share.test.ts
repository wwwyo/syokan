import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createShareHandlers, readAuth } from "./share";
import { createSnapshotStore, type SnapshotStore } from "./store";

const ORIGIN = "https://share.test";

type WorkerCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
};

// hc (hono/client) が投げる fetch を捕捉する stub。呼び出しは Request に正規化して記録する。
function makeWorkerFetch(
  respond: (call: WorkerCall) => Response | Promise<Response>,
) {
  const calls: WorkerCall[] = [];
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    const text = await req.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    const call: WorkerCall = { url: req.url, method: req.method, headers, body };
    calls.push(call);
    return respond(call);
  }) as unknown as typeof fetch;
  return { stub, calls };
}

function failingFetch(): typeof fetch {
  return (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
}

function makeRequest(url: string, init?: RequestInit) {
  return new Request(`http://test${url}`, init);
}

function makeParamRequest(
  url: string,
  params: Record<string, string>,
  init?: RequestInit,
) {
  const req = new Request(`http://test${url}`, init) as Request & {
    params: Record<string, string>;
  };
  Object.defineProperty(req, "params", { value: params });
  return req;
}

describe("share routes", () => {
  let dir: string;
  let store: SnapshotStore;
  let authFilePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "syokan-share-"));
    store = createSnapshotStore(dir);
    authFilePath = join(dir, "auth.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function handlers(fetchImpl: typeof fetch) {
    return createShareHandlers({
      store,
      fetch: fetchImpl,
      origin: ORIGIN,
      authFilePath,
    });
  }

  async function loginDirectly(token = "tok-1", login = "octocat") {
    await writeFile(authFilePath, JSON.stringify({ token, login }));
  }

  describe("auth", () => {
    test("POST /api/auth/login exchanges the GitHub token via the worker and stores auth.json with mode 0600", async () => {
      const { stub, calls } = makeWorkerFetch(() =>
        Response.json({ token: "api-token-1", login: "octocat" }),
      );
      const share = handlers(stub);
      const res = await share.login(
        makeRequest("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ githubAccessToken: "gh-abc" }),
        }),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ login: "octocat" });

      expect(calls[0]?.url).toBe(`${ORIGIN}/api/v1/auth/token`);
      expect(calls[0]?.method).toBe("POST");
      expect(calls[0]?.body).toEqual({ githubAccessToken: "gh-abc" });

      expect(await readAuth(authFilePath)).toEqual({
        token: "api-token-1",
        login: "octocat",
      });
      const mode = (await stat(authFilePath)).mode & 0o777;
      expect(mode).toBe(0o600);
    });

    test("POST /api/auth/login passes worker errors through (e.g. 401)", async () => {
      const { stub } = makeWorkerFetch(() =>
        Response.json({ error: "github_verification_failed" }, { status: 401 }),
      );
      const share = handlers(stub);
      const res = await share.login(
        makeRequest("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ githubAccessToken: "bad" }),
        }),
      );
      expect(res.status).toBe(401);
      expect(await readAuth(authFilePath)).toBeUndefined();
    });

    test("POST /api/auth/login returns 400 validation_failed without githubAccessToken", async () => {
      const { stub, calls } = makeWorkerFetch(() => Response.json({}));
      const share = handlers(stub);
      const res = await share.login(
        makeRequest("/api/auth/login", { method: "POST", body: "{}" }),
      );
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe(
        "validation_failed",
      );
      expect(calls).toEqual([]);
    });

    test("GET /api/auth/login returns { login } when logged in, 401 when not", async () => {
      const share = handlers(failingFetch());
      const before = await share.loginStatus();
      expect(before.status).toBe(401);
      expect(((await before.json()) as { error: string }).error).toBe(
        "not_logged_in",
      );

      await loginDirectly();
      const after = await share.loginStatus();
      expect(after.status).toBe(200);
      expect(await after.json()).toEqual({ login: "octocat" });
    });

    test("DELETE /api/auth/login removes auth.json", async () => {
      await loginDirectly();
      const share = handlers(failingFetch());
      const res = await share.logout();
      expect(await res.json()).toEqual({ ok: true });
      expect((await share.loginStatus()).status).toBe(401);
    });
  });

  describe("POST /api/snapshots/:id/publish", () => {
    test("materializes FileDoc, posts the frozen envelope with a bearer token, and relays the 201", async () => {
      const filePath = join(dir, "notes.md");
      await writeFile(filePath, "# frozen");
      const env = await store.create({
        root: {
          type: "Stack",
          props: {},
          children: [{ type: "FileDoc", props: { path: filePath } }],
        },
      });
      await loginDirectly("tok-1");
      const created = {
        id: "share-1",
        url: "https://syokan.dev/shares/share-1",
        expiresAt: "2026-07-11T00:00:00.000Z",
      };
      const { stub, calls } = makeWorkerFetch(() =>
        Response.json(created, { status: 201 }),
      );
      const share = handlers(stub);
      const res = await share.publishSnapshot(
        makeParamRequest(`/api/snapshots/${env.id}/publish`, { id: env.id }, {
          method: "POST",
          body: JSON.stringify({ expiresIn: 3600 }),
        }) as never,
      );
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual(created);

      expect(calls[0]?.url).toBe(`${ORIGIN}/api/v1/shares`);
      expect(calls[0]?.headers.authorization).toBe("Bearer tok-1");
      const body = calls[0]?.body as {
        envelope: {
          id: string;
          root: { children: Array<{ type: string; props: Record<string, unknown> }> };
        };
        sourceSnapshotId: string;
        expiresIn: number;
      };
      expect(body.sourceSnapshotId).toBe(env.id);
      expect(body.expiresIn).toBe(3600);
      expect(body.envelope.id).toBe(env.id);
      // FileDoc は publish 時点の内容で具象ノードに凍結されている
      expect(body.envelope.root.children[0]).toEqual({
        type: "MarkdownDoc",
        props: { body: "# frozen" },
      });
    });

    test("accepts a request without a body (expiresIn omitted)", async () => {
      const env = await store.create({
        root: { type: "Heading", props: { text: "S" } },
      });
      await loginDirectly();
      const { stub, calls } = makeWorkerFetch(() =>
        Response.json(
          { id: "s", url: "u", expiresAt: "e" },
          { status: 201 },
        ),
      );
      const share = handlers(stub);
      const res = await share.publishSnapshot(
        makeParamRequest(`/api/snapshots/${env.id}/publish`, { id: env.id }, {
          method: "POST",
        }) as never,
      );
      expect(res.status).toBe(201);
      expect(
        (calls[0]?.body as { expiresIn?: number }).expiresIn,
      ).toBeUndefined();
    });

    test("unknown snapshot id -> 404 not_found", async () => {
      const share = handlers(failingFetch());
      const res = await share.publishSnapshot(
        makeParamRequest("/api/snapshots/missing/publish", { id: "missing" }, {
          method: "POST",
        }) as never,
      );
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: string }).error).toBe("not_found");
    });

    test("unreadable FileDoc -> 422 materialize_failed with path + reason; worker is not called", async () => {
      const missing = join(dir, "gone.md");
      const env = await store.create({
        root: { type: "FileDoc", props: { path: missing } },
      });
      const { stub, calls } = makeWorkerFetch(() => Response.json({}));
      const share = handlers(stub);
      const res = await share.publishSnapshot(
        makeParamRequest(`/api/snapshots/${env.id}/publish`, { id: env.id }, {
          method: "POST",
        }) as never,
      );
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({
        error: "materialize_failed",
        path: missing,
        reason: "not_found",
      });
      expect(calls).toEqual([]);
    });

    test("not logged in -> 401 not_logged_in; worker is not called", async () => {
      const env = await store.create({
        root: { type: "Heading", props: { text: "S" } },
      });
      const { stub, calls } = makeWorkerFetch(() => Response.json({}));
      const share = handlers(stub);
      const res = await share.publishSnapshot(
        makeParamRequest(`/api/snapshots/${env.id}/publish`, { id: env.id }, {
          method: "POST",
        }) as never,
      );
      expect(res.status).toBe(401);
      expect(((await res.json()) as { error: string }).error).toBe(
        "not_logged_in",
      );
      expect(calls).toEqual([]);
    });

    test("worker 401 (stale token) is mapped to not_logged_in", async () => {
      const env = await store.create({
        root: { type: "Heading", props: { text: "S" } },
      });
      await loginDirectly();
      const { stub } = makeWorkerFetch(() =>
        Response.json({ error: "unauthorized" }, { status: 401 }),
      );
      const share = handlers(stub);
      const res = await share.publishSnapshot(
        makeParamRequest(`/api/snapshots/${env.id}/publish`, { id: env.id }, {
          method: "POST",
        }) as never,
      );
      expect(res.status).toBe(401);
      expect(((await res.json()) as { error: string }).error).toBe(
        "not_logged_in",
      );
    });

    test("other worker errors pass status and body through (e.g. 413)", async () => {
      const env = await store.create({
        root: { type: "Heading", props: { text: "S" } },
      });
      await loginDirectly();
      const { stub } = makeWorkerFetch(() =>
        Response.json({ error: "too_large" }, { status: 413 }),
      );
      const share = handlers(stub);
      const res = await share.publishSnapshot(
        makeParamRequest(`/api/snapshots/${env.id}/publish`, { id: env.id }, {
          method: "POST",
        }) as never,
      );
      expect(res.status).toBe(413);
      expect(((await res.json()) as { error: string }).error).toBe("too_large");
    });

    test("network failure -> 502 share_api_unreachable", async () => {
      const env = await store.create({
        root: { type: "Heading", props: { text: "S" } },
      });
      await loginDirectly();
      const share = handlers(failingFetch());
      const res = await share.publishSnapshot(
        makeParamRequest(`/api/snapshots/${env.id}/publish`, { id: env.id }, {
          method: "POST",
        }) as never,
      );
      expect(res.status).toBe(502);
      expect(((await res.json()) as { error: string }).error).toBe(
        "share_api_unreachable",
      );
    });
  });

  describe("GET /api/shares", () => {
    test("not logged in -> 200 with an empty list; worker is not called", async () => {
      const { stub, calls } = makeWorkerFetch(() => Response.json({}));
      const share = handlers(stub);
      const res = await share.listShares(makeRequest("/api/shares?snapshot=x"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ shares: [] });
      expect(calls).toEqual([]);
    });

    test("logged in -> proxies to the worker with the bearer token and snapshot filter", async () => {
      await loginDirectly("tok-9");
      const shares = [
        {
          id: "s1",
          url: "https://syokan.dev/shares/s1",
          sourceSnapshotId: "snap-1",
          createdAt: "c",
          expiresAt: "e",
        },
      ];
      const { stub, calls } = makeWorkerFetch(() => Response.json({ shares }));
      const share = handlers(stub);
      const res = await share.listShares(
        makeRequest("/api/shares?snapshot=snap-1"),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ shares });
      expect(calls[0]?.method).toBe("GET");
      const url = new URL(calls[0]?.url ?? "");
      expect(url.pathname).toBe("/api/v1/shares");
      expect(url.searchParams.get("snapshot")).toBe("snap-1");
      expect(calls[0]?.headers.authorization).toBe("Bearer tok-9");
    });
  });

  describe("DELETE /api/shares/:id", () => {
    test("not logged in -> 401", async () => {
      const share = handlers(failingFetch());
      const res = await share.deleteShare(
        makeParamRequest("/api/shares/s1", { id: "s1" }, {
          method: "DELETE",
        }) as never,
      );
      expect(res.status).toBe(401);
      expect(((await res.json()) as { error: string }).error).toBe(
        "not_logged_in",
      );
    });

    test("logged in -> proxies the delete to the worker", async () => {
      await loginDirectly("tok-2");
      const { stub, calls } = makeWorkerFetch(() => Response.json({ ok: true }));
      const share = handlers(stub);
      const res = await share.deleteShare(
        makeParamRequest("/api/shares/s1", { id: "s1" }, {
          method: "DELETE",
        }) as never,
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(calls[0]?.method).toBe("DELETE");
      expect(new URL(calls[0]?.url ?? "").pathname).toBe("/api/v1/shares/s1");
      expect(calls[0]?.headers.authorization).toBe("Bearer tok-2");
    });
  });
});
