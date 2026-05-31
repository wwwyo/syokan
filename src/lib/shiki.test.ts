import { describe, expect, test } from "bun:test";
import { highlightToHtml, resolveCodeInfo } from "./shiki";

describe("highlightToHtml", () => {
  test("produces a dual-theme shiki <pre> with token spans", async () => {
    const html = await highlightToHtml("const x: number = 1;", "ts");
    expect(html).toContain("class=\"shiki");
    expect(html).toContain("shiki-themes");
    // dual theme CSS variables (defaultColor:false)
    expect(html).toContain("--shiki-light");
    expect(html).toContain("--shiki-dark");
    expect(html).toContain("const");
  });

  test("falls back to plaintext for an unknown language without throwing", async () => {
    const html = await highlightToHtml("just some text", "made-up-lang");
    expect(html).toContain("class=\"shiki");
    expect(html).toContain("just some text");
  });

  test("highlights bash", async () => {
    const html = await highlightToHtml("echo hello", "bash");
    expect(html).toContain("class=\"shiki");
    expect(html).toContain("echo");
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
    // 拡張子をそのまま渡す。py は shiki の python alias として解決される
    expect(resolveCodeInfo("app.py")).toEqual({
      lang: "py",
      filename: "app.py",
    });
    // 複数ドットは最後の拡張子で解決する
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

  // 拡張子→言語マップを持たず shiki の alias に委ねるので、end-to-end で担保する
  test("extension-derived lang is resolved by shiki aliases (py → python)", async () => {
    const { lang } = resolveCodeInfo("app.py"); // "py"
    const highlighted = await highlightToHtml("import os", lang);
    const fallback = await highlightToHtml("import os", "alias-less-ext");
    expect(highlighted).toContain("class=\"shiki");
    // py が python として解決され、未知 lang (text) とは別のトークン分割になる
    expect(highlighted).not.toBe(fallback);
  });
});
