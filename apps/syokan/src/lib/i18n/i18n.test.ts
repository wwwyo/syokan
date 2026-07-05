import { describe, expect, test } from "bun:test";
import { detectLang } from "./index";

describe("detectLang", () => {
  test("ja / ja-JP → ja", () => {
    expect(detectLang(["ja"])).toBe("ja");
    expect(detectLang(["ja-JP"])).toBe("ja");
  });

  test("優先順位の先頭にある対応言語を選ぶ (含まれるかどうかでは判定しない)", () => {
    expect(detectLang(["en-US", "ja-JP", "en"])).toBe("en");
    expect(detectLang(["fr", "ja-JP"])).toBe("ja");
  });

  test("大文字小文字を無視する", () => {
    expect(detectLang(["JA-JP"])).toBe("ja");
  });

  test("ja 以外 / 空 → en", () => {
    expect(detectLang(["en-US", "fr"])).toBe("en");
    expect(detectLang([])).toBe("en");
  });
});
