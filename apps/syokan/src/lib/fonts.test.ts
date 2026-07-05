import { describe, expect, test } from "bun:test";
import {
  DEFAULT_FONT,
  FONT_PRESETS,
  getFontPreset,
  googleFontHref,
  isFontValue,
} from "./fonts";

describe("FONT_PRESETS", () => {
  test("includes the system default and it has no google query", () => {
    const system = getFontPreset(DEFAULT_FONT);
    expect(system.value).toBe("system");
    expect(system.googleQuery).toBeUndefined();
    expect(googleFontHref(system)).toBeUndefined();
  });

  test("preset values are unique identifier-shaped strings", () => {
    const seen = new Set<string>();
    for (const p of FONT_PRESETS) {
      expect(p.value).toMatch(/^[a-z0-9-]{1,40}$/);
      expect(seen.has(p.value)).toBe(false);
      seen.add(p.value);
    }
  });

  test("google presets build a css2 stylesheet url with display=swap", () => {
    const inter = getFontPreset("inter");
    expect(googleFontHref(inter)).toBe(
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap",
    );
  });
});

describe("getFontPreset", () => {
  test("falls back to system for unknown values", () => {
    expect(getFontPreset("does-not-exist").value).toBe("system");
  });
});

describe("isFontValue", () => {
  test("accepts known presets, rejects unknown / non-string", () => {
    expect(isFontValue("inter")).toBe(true);
    expect(isFontValue("system")).toBe(true);
    expect(isFontValue("nope")).toBe(false);
    expect(isFontValue(42)).toBe(false);
  });
});
