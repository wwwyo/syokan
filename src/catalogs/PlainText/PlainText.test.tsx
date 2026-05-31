import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { PlainText } from ".";

describe("PlainText", () => {
  test("renders the body verbatim in a monospaced pre (Shiki fallback before highlight)", () => {
    const body = "# not a heading\n* not a bullet\n  indented log line";
    const html = renderToString(createElement(PlainText, { body }));
    expect(html).toContain('data-slot="plain-text"');
    // useEffect は SSR で走らないため CodeBlock の plain fallback が出る
    expect(html).toContain('data-slot="codeblock"');
    expect(html).toContain("<pre");
  });

  test("does not interpret markdown syntax (# / * stay literal, no h1/ul)", () => {
    const body = "# title-like\n* item-like";
    const html = renderToString(createElement(PlainText, { body }));
    expect(html).toContain("# title-like");
    expect(html).toContain("* item-like");
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<ul");
  });
});
