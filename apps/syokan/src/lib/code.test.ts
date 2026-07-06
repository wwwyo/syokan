import { describe, expect, test } from "bun:test";
import { toCodeLang } from "./code";

describe("toCodeLang", () => {
  test("passes through supported langs and aliases", () => {
    expect(toCodeLang("ts")).toBe("ts");
    expect(toCodeLang("py")).toBe("py");
    expect(toCodeLang("bash")).toBe("bash");
  });

  test("is case-insensitive", () => {
    expect(toCodeLang("TS")).toBe("TS");
    expect(toCodeLang("JSON")).toBe("JSON");
  });

  test("falls back to 'text' for unknown or missing langs (avoids silent empty render)", () => {
    expect(toCodeLang("made-up-lang")).toBe("text");
    expect(toCodeLang("xyz")).toBe("text");
    expect(toCodeLang(undefined)).toBe("text");
    expect(toCodeLang("")).toBe("text");
  });
});
