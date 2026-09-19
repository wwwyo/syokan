import { describe, expect, test } from "bun:test";
import { scrollRestorationKey } from "./router";

describe("scrollRestorationKey", () => {
  test("returns the same key for the same pathname across different history state, hash, and search", () => {
    const a = {
      pathname: "/snapshots/abc",
      state: { __TSR_key: "key-1" },
      hash: "",
      search: {},
    };
    const b = {
      pathname: "/snapshots/abc",
      state: { __TSR_key: "key-2" },
      hash: "section-1",
      search: { sort: "asc" },
    };
    expect(scrollRestorationKey(a)).toBe(scrollRestorationKey(b));
  });

  test("returns a different key for a different snapshot's pathname", () => {
    const a = { pathname: "/snapshots/abc" };
    const b = { pathname: "/snapshots/xyz" };
    expect(scrollRestorationKey(a)).not.toBe(scrollRestorationKey(b));
  });
});
