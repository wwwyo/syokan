import { afterEach, describe, expect, test } from "bun:test";
import {
  deleteSnapshot,
  fetchSnapshotEnvelope,
  nextSnapshotId,
  patchSnapshot,
} from "./snapshots";

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

describe("fetchSnapshotEnvelope (the view route's read)", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const envelope = {
    schemaVersion: 1,
    id: "a",
    root: { type: "Stack", props: {} },
    createdAt: "2026-05-21T03:04:00Z",
  };

  test("an active envelope is returned as-is", async () => {
    globalThis.fetch = (async () =>
      Response.json({ ...envelope, archivedAt: null })) as unknown as typeof fetch;
    expect((await fetchSnapshotEnvelope("a"))?.id).toBe("a");
  });

  test("an archived envelope is not-found for the view, like a 404", async () => {
    globalThis.fetch = (async () =>
      Response.json({
        ...envelope,
        archivedAt: "2026-05-22T00:00:00Z",
      })) as unknown as typeof fetch;
    expect(await fetchSnapshotEnvelope("a")).toBeNull();
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    expect(await fetchSnapshotEnvelope("a")).toBeNull();
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

  test("PATCHes { nodeId, item, set, expect } to /api/snapshots/:id", async () => {
    let seen: { url: string; method?: string; body: unknown } | undefined;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen = {
        url: String(input),
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      return Response.json({}, { status: 200 });
    }) as unknown as typeof fetch;
    const patch = {
      item: { label: "a", occurrence: 2 },
      set: { checked: true },
      expect: { items: [{ label: "a" }, { label: "a" }] },
    };
    expect(await patchSnapshot("s1", "todo", patch)).toBe(true);
    expect(seen).toEqual({
      url: "/api/snapshots/s1",
      method: "PATCH",
      body: { nodeId: "todo", ...patch },
    });
  });

  test("any non-OK (incl. a rejected write like 409) returns false so the view reverts", async () => {
    const patch = {
      item: { label: "a", occurrence: 1 },
      set: { checked: true },
      expect: { items: [{ label: "a" }] },
    };
    for (const status of [409, 422, 404, 500]) {
      globalThis.fetch = (async () => new Response(null, { status })) as unknown as typeof fetch;
      expect(await patchSnapshot("s1", "todo", patch)).toBe(false);
    }
  });

  test("swallows a network drop (fetch reject) and returns false", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(
      await patchSnapshot("s1", "todo", {
        item: { label: "a", occurrence: 1 },
        set: { checked: true },
        expect: { items: [{ label: "a" }] },
      }),
    ).toBe(false);
  });
});
