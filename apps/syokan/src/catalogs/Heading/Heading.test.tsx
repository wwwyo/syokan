import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Heading } from ".";

describe("Heading", () => {
  test("renders the text in an h-tag matching the level", () => {
    const html = renderToString(
      createElement(Heading, { text: "Title", level: 1 }),
    );
    expect(html).toContain("<h1");
    expect(html).toContain("Title");
  });

  test("defaults to level 2", () => {
    const html = renderToString(createElement(Heading, { text: "X" }));
    expect(html).toContain("<h2");
  });

  test("wraps text in a link when href is given", () => {
    const html = renderToString(
      createElement(Heading, { text: "T", href: "https://example.com/" }),
    );
    expect(html).toContain("<a");
    expect(html).toContain('href="https://example.com/"');
  });

  test("plain text without href has no anchor", () => {
    const html = renderToString(createElement(Heading, { text: "T" }));
    expect(html).not.toContain("<a");
  });
});
