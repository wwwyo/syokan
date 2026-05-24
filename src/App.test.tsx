import { describe, expect, test } from "bun:test";
import { matchViewId } from "./App";

describe("matchViewId", () => {
  test("extracts id from /views/:id", () => {
    expect(matchViewId("/views/abc-123")).toBe("abc-123");
  });

  test("extracts id with a trailing slash", () => {
    expect(matchViewId("/views/abc-123/")).toBe("abc-123");
  });

  test("decodes percent-encoded id segments", () => {
    expect(matchViewId("/views/a%2Fb")).toBe("a/b");
  });

  test("returns null for the home path", () => {
    expect(matchViewId("/")).toBeNull();
  });

  test("returns null for nested paths beyond a single id segment", () => {
    expect(matchViewId("/views/abc/extra")).toBeNull();
  });

  test("returns null for non-view paths", () => {
    expect(matchViewId("/api/views/abc")).toBeNull();
  });
});
