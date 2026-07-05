import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { CodeSnippet } from ".";

describe("CodeSnippet", () => {
  test("renders the code verbatim inside a pre/code", () => {
    const html = renderToString(
      createElement(CodeSnippet, { code: "bun run dev" }),
    );
    expect(html).toContain("<pre");
    expect(html).toContain("bun run dev");
  });

  test("escapes html-significant characters in the code", () => {
    const html = renderToString(
      createElement(CodeSnippet, { code: '<script>"&' }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
