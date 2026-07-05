import { describe, expect, test } from "bun:test";
import { isTheme, resolveScheme } from "./theme";

describe("resolveScheme", () => {
  test("system follows the OS preference", () => {
    expect(resolveScheme("system", true)).toBe("dark");
    expect(resolveScheme("system", false)).toBe("light");
  });

  test("explicit light/dark ignore the OS preference", () => {
    expect(resolveScheme("light", true)).toBe("light");
    expect(resolveScheme("dark", false)).toBe("dark");
  });
});

describe("isTheme", () => {
  test("accepts the three known values", () => {
    expect(isTheme("system")).toBe(true);
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
  });

  test("rejects unknown or non-string values", () => {
    expect(isTheme("auto")).toBe(false);
    expect(isTheme("")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });
});
