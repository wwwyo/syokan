import { describe, expect, test } from "bun:test";
import { detectLang } from "./index";

describe("detectLang", () => {
  test("ja / ja-JP → ja", () => {
    expect(detectLang(["ja"])).toBe("ja");
    expect(detectLang(["ja-JP"])).toBe("ja");
  });

  test("picks the first supported language by priority (not by mere presence)", () => {
    expect(detectLang(["en-US", "ja-JP", "en"])).toBe("en");
    expect(detectLang(["fr", "ja-JP"])).toBe("ja");
  });

  test("is case-insensitive", () => {
    expect(detectLang(["JA-JP"])).toBe("ja");
  });

  test("non-ja / empty → en", () => {
    expect(detectLang(["en-US", "fr"])).toBe("en");
    expect(detectLang([])).toBe("en");
  });
});
