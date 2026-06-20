import { describe, expect, test } from "bun:test";
import { getStoredFont, isFont } from "./font";

describe("isFont", () => {
  test("accepts the three known values", () => {
    expect(isFont("current")).toBe(true);
    expect(isFont("geist")).toBe(true);
    expect(isFont("system")).toBe(true);
  });

  test("rejects unknown or non-string values", () => {
    expect(isFont("moralerspace")).toBe(false);
    expect(isFont("")).toBe(false);
    expect(isFont(null)).toBe(false);
    expect(isFont(undefined)).toBe(false);
  });
});

describe("getStoredFont", () => {
  test("defaults to current without a window/storage", () => {
    expect(getStoredFont()).toBe("current");
  });
});
