import { describe, expect, test } from "bun:test";
import { getStoredFont, isFont } from "./font";

describe("isFont", () => {
  test("accepts known preset values", () => {
    expect(isFont("system")).toBe(true);
    expect(isFont("moralerspace")).toBe(true);
    expect(isFont("inter")).toBe(true);
    expect(isFont("noto-sans-jp")).toBe(true);
  });

  test("rejects unknown or non-string values", () => {
    expect(isFont("current")).toBe(false); // the old enum value is retired
    expect(isFont("geist mono")).toBe(false);
    expect(isFont("")).toBe(false);
    expect(isFont(null)).toBe(false);
    expect(isFont(undefined)).toBe(false);
  });
});

describe("getStoredFont", () => {
  test("defaults to system without a window/storage", () => {
    expect(getStoredFont()).toBe("system");
  });
});
