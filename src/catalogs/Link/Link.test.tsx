import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Link } from ".";

describe("Link", () => {
  test("renders an anchor to href with the label text", () => {
    const html = renderToString(
      createElement(Link, { href: "https://example.com/", text: "Example" }),
    );
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain("Example");
  });

  test("falls back to href as label when text is omitted", () => {
    const html = renderToString(
      createElement(Link, { href: "https://example.com/" }),
    );
    expect(html).toContain("https://example.com/");
  });
});
