import { afterEach, describe, expect, test } from "bun:test";
import { deleteSnapshot, nextSnapshotId } from "./snapshots";

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

  test("ok / 404 は成功 (冪等)、それ以外は失敗", async () => {
    globalThis.fetch = (async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
    expect(await deleteSnapshot("a")).toBe(true);
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    expect(await deleteSnapshot("a")).toBe(true);
    globalThis.fetch = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    expect(await deleteSnapshot("a")).toBe(false);
  });

  test("network 断 (fetch reject) を握って false を返す", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await deleteSnapshot("a")).toBe(false);
  });
});
