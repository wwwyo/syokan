import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MarkdownDoc } from "./MarkdownDoc";

describe("MarkdownDoc", () => {
  test("renders headings, paragraphs and lists", () => {
    const body = [
      "# Title",
      "",
      "## Subtitle",
      "",
      "First paragraph with **bold**.",
      "",
      "- item1",
      "- item2",
      "",
      "1. one",
      "2. two",
    ].join("\n");
    const html = renderToString(createElement(MarkdownDoc, { body }));
    expect(html).toContain("<h1");
    expect(html).toContain("Title");
    expect(html).toContain("<h2");
    expect(html).toContain("Subtitle");
    expect(html).toContain("<p");
    expect(html).toContain("First paragraph");
    expect(html).toContain("<ul");
    expect(html).toContain("item1");
    expect(html).toContain("<ol");
    expect(html).toContain("one");
  });

  test("renders code blocks in monospaced <pre><code> (fallback before highlight)", () => {
    const body = "```ts\nconst x = 1;\n```";
    const html = renderToString(createElement(MarkdownDoc, { body }));
    // useEffect は SSR で走らないため Shiki 前の plain fallback が出る
    expect(html).toContain("<pre");
    expect(html).toContain("font-mono");
    expect(html).toContain("const x = 1;");
    expect(html).toContain("data-slot=\"codeblock\"");
  });

  test("renders inline links as anchors with href", () => {
    const body = "see [example](https://example.com) here";
    const html = renderToString(createElement(MarkdownDoc, { body }));
    expect(html).toContain("<a");
    expect(html).toContain("href=\"https://example.com\"");
    expect(html).toContain("example");
  });

  test("renders inline code differently from block code", () => {
    const body = "use `bun test` to run";
    const html = renderToString(createElement(MarkdownDoc, { body }));
    expect(html).toContain("<code");
    expect(html).toContain("bun test");
  });

  test("renders GFM tables (remark-gfm)", () => {
    const body = [
      "| Name | Score |",
      "| ---- | ----- |",
      "| Alice | 10 |",
      "| Bob | 20 |",
    ].join("\n");
    const html = renderToString(createElement(MarkdownDoc, { body }));
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("Name");
    expect(html).toContain("Alice");
    expect(html).toContain("20");
  });

  test("renders GFM strikethrough (remark-gfm)", () => {
    const body = "this is ~~gone~~ now";
    const html = renderToString(createElement(MarkdownDoc, { body }));
    expect(html).toContain("<del");
    expect(html).toContain("gone");
  });

  test("renders GFM task lists with checkboxes (remark-gfm)", () => {
    const body = ["- [x] done", "- [ ] todo"].join("\n");
    const html = renderToString(createElement(MarkdownDoc, { body }));
    expect(html).toContain("type=\"checkbox\"");
    expect(html).toContain("done");
    expect(html).toContain("todo");
  });

  test("task-list <ul> drops the disc bullet (list-none, no list-disc)", () => {
    const body = ["- [x] done", "- [ ] todo"].join("\n");
    const html = renderToString(createElement(MarkdownDoc, { body }));
    // checkbox 付き項目に丸ポチが二重に付かないこと
    expect(html).toContain("list-none");
    // 通常リストは従来どおり list-disc
    const plain = renderToString(
      createElement(MarkdownDoc, { body: "- a\n- b" }),
    );
    expect(plain).toContain("list-disc");
  });

  test("renders GFM autolinks (remark-gfm)", () => {
    const body = "visit https://example.com for more";
    const html = renderToString(createElement(MarkdownDoc, { body }));
    expect(html).toContain("href=\"https://example.com\"");
  });
});
