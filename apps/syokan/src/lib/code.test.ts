import { describe, expect, test } from "bun:test";
import { resolveCodeInfo, toCodeLang } from "./code";

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

describe("resolveCodeInfo", () => {
  test("plain language id stays as lang (no filename)", () => {
    expect(resolveCodeInfo("ts")).toEqual({ lang: "ts" });
    expect(resolveCodeInfo("bash")).toEqual({ lang: "bash" });
  });

  test("filename: keeps the raw extension as the lang candidate and the filename", () => {
    expect(resolveCodeInfo("hoge.json")).toEqual({
      lang: "json",
      filename: "hoge.json",
    });
    // pass the extension as-is; py resolves as Shiki's python alias
    expect(resolveCodeInfo("app.py")).toEqual({
      lang: "py",
      filename: "app.py",
    });
    // multiple dots resolve on the last extension
    expect(resolveCodeInfo("foo.test.ts")).toEqual({
      lang: "ts",
      filename: "foo.test.ts",
    });
  });

  test("filename with an alias-less extension: raw ext as lang (highlight falls back to text)", () => {
    expect(resolveCodeInfo("notes.xyz")).toEqual({
      lang: "xyz",
      filename: "notes.xyz",
    });
  });

  test("empty info returns nothing", () => {
    expect(resolveCodeInfo(undefined)).toEqual({});
    expect(resolveCodeInfo("")).toEqual({});
  });
});
