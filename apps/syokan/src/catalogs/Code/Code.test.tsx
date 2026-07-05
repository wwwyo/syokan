import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Code, codePropsSchema } from ".";

describe("codePropsSchema", () => {
  test("accepts code with optional lang/filename", () => {
    expect(codePropsSchema.parse({ code: "const x = 1;" })).toEqual({
      code: "const x = 1;",
    });
    expect(
      codePropsSchema.parse({ code: "x", lang: "ts", filename: "a.ts" }),
    ).toEqual({ code: "x", lang: "ts", filename: "a.ts" });
  });

  test("rejects missing code and unknown keys (strict)", () => {
    expect(codePropsSchema.safeParse({ lang: "ts" }).success).toBe(false);
    expect(codePropsSchema.safeParse({ code: "x", extra: 1 }).success).toBe(
      false,
    );
  });
});

describe("Code", () => {
  // コード本体は @pierre/diffs の File が client 側 (shadow DOM) で描画するため、
  // SSR では host 要素のみ出る。視覚は Storybook で担保する。
  test("renders the pierre File host with a copy button", () => {
    const html = renderToString(createElement(Code, { code: "const x = 1;" }));
    expect(html).toContain('data-slot="code"');
    expect(html).toContain("<diffs-container");
    expect(html).toContain('data-slot="code-copy"');
  });

  test("renders a filename header row when filename is given", () => {
    const html = renderToString(
      createElement(Code, { code: "x", filename: "a.ts" }),
    );
    expect(html).toContain('data-slot="code-filename"');
    expect(html).toContain("a.ts");
  });
});
