import { describe, expect, test } from "bun:test";
import { nextViewId } from "./views";

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
