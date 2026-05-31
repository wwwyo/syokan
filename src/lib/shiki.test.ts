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

  test("filename: derives lang from extension and keeps the filename", () => {
    expect(resolveCodeInfo("hoge.json")).toEqual({
      lang: "json",
      filename: "hoge.json",
    });
    expect(resolveCodeInfo("app.py")).toEqual({
      lang: "python",
      filename: "app.py",
    });
    // 複数ドットは最後の拡張子で解決する
    expect(resolveCodeInfo("foo.test.ts")).toEqual({
      lang: "ts",
      filename: "foo.test.ts",
    });
  });

  test("filename with unknown extension: filename only, lang undefined", () => {
    const r = resolveCodeInfo("notes.xyz");
    expect(r.filename).toBe("notes.xyz");
    expect(r.lang).toBeUndefined();
  });

  test("empty info returns nothing", () => {
    expect(resolveCodeInfo(undefined)).toEqual({});
    expect(resolveCodeInfo("")).toEqual({});
  });
});
