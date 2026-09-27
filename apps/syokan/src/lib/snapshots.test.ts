import { afterEach, describe, expect, test } from "bun:test";
import { deleteSnapshot, nextSnapshotId, patchSnapshot } from "./snapshots";

describe("nextSnapshotId", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  test("returns the item that follows the deleted one", () => {
    expect(nextSnapshotId(items, "a")).toBe("b");
    expect(nextSnapshotId(items, "b")).toBe("c");
  });

  test("falls back to the previous item when the last is deleted", () => {
    expect(nextSnapshotId(items, "c")).toBe("b");
  });

  test("returns null when the list had only the deleted item", () => {
    expect(nextSnapshotId([{ id: "only" }], "only")).toBeNull();
  });

  test("returns null when the deleted id is not in the list", () => {
    expect(nextSnapshotId(items, "missing")).toBeNull();
  });
});

describe("deleteSnapshot", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("ok / 404 succeed (idempotent), everything else fails", async () => {
    globalThis.fetch = (async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
    expect(await deleteSnapshot("a")).toBe(true);
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    expect(await deleteSnapshot("a")).toBe(true);
    globalThis.fetch = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    expect(await deleteSnapshot("a")).toBe(false);
  });

  test("swallows a network drop (fetch reject) and returns false", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await deleteSnapshot("a")).toBe(false);
  });
});

describe("patchSnapshot", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("PATCHes { nodeId, set } to /api/snapshots/:id", async () => {
    let seen: { url: string; method?: string; body: unknown } | undefined;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen = {
        url: String(input),
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      return Response.json({}, { status: 200 });
    }) as unknown as typeof fetch;
    expect(await patchSnapshot("s1", "todo", { "items.0.checked": true })).toBe(true);
    expect(seen).toEqual({
      url: "/api/snapshots/s1",
      method: "PATCH",
      body: { nodeId: "todo", set: { "items.0.checked": true } },
    });
  });

  test("any non-OK (incl. a rejected write like 409) returns false so the view reverts", async () => {
    for (const status of [409, 422, 404, 500]) {
      globalThis.fetch = (async () => new Response(null, { status })) as unknown as typeof fetch;
      expect(await patchSnapshot("s1", "todo", {})).toBe(false);
    }
  });

  test("swallows a network drop (fetch reject) and returns false", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await patchSnapshot("s1", "todo", {})).toBe(false);
  });
});
