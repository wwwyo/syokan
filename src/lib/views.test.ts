import { afterEach, describe, expect, test } from "bun:test";
import { deleteView, nextViewId } from "./views";

describe("nextViewId", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  test("returns the item that follows the deleted one", () => {
    expect(nextViewId(items, "a")).toBe("b");
    expect(nextViewId(items, "b")).toBe("c");
  });

  test("falls back to the previous item when the last is deleted", () => {
    expect(nextViewId(items, "c")).toBe("b");
  });

  test("returns null when the list had only the deleted item", () => {
    expect(nextViewId([{ id: "only" }], "only")).toBeNull();
  });

  test("returns null when the deleted id is not in the list", () => {
    expect(nextViewId(items, "missing")).toBeNull();
  });
});

describe("deleteView", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("ok / 404 は成功 (冪等)、それ以外は失敗", async () => {
    globalThis.fetch = (async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
    expect(await deleteView("a")).toBe(true);
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    expect(await deleteView("a")).toBe(true);
    globalThis.fetch = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    expect(await deleteView("a")).toBe(false);
  });

  test("network 断 (fetch reject) を握って false を返す", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await deleteView("a")).toBe(false);
  });
});
