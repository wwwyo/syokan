import { describe, expect, test } from "bun:test";
import { detectLang } from "./i18n";

describe("detectLang", () => {
  test("ja / ja-JP → ja", () => {
    expect(detectLang(["ja"])).toBe("ja");
    expect(detectLang(["ja-JP"])).toBe("ja");
  });

  test("ja が先頭でなくても含まれれば ja", () => {
    expect(detectLang(["en-US", "ja-JP", "en"])).toBe("ja");
  });

  test("大文字小文字を無視する", () => {
    expect(detectLang(["JA-JP"])).toBe("ja");
  });

  test("ja 以外 / 空 → en", () => {
    expect(detectLang(["en-US", "fr"])).toBe("en");
    expect(detectLang([])).toBe("en");
  });
});
