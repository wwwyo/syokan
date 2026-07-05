import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MarkdownDoc } from ".";

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

  test("renders fenced code via Code (pierre File host; highlights client-side)", () => {
    const body = "```ts\nconst x = 1;\n```";
    const html = renderToString(createElement(MarkdownDoc, { body }));
    // code fences delegate to the Code catalog (= @pierre/diffs File). The code body renders
    // client-side, so SSR emits only the host.
    expect(html).toContain('data-slot="code"');
    expect(html).toContain("<diffs-container");
  });

  test("renders a filename header for ```filename.ext fences", () => {
    const body = '```hoge.json\n{"a":1}\n```';
    const html = renderToString(createElement(MarkdownDoc, { body }));
    expect(html).toContain('data-slot="code-filename"');
    expect(html).toContain("hoge.json");
  });

  test("plain language fences have no filename header", () => {
    const body = "```ts\nconst x = 1;\n```";
    const html = renderToString(createElement(MarkdownDoc, { body }));
    expect(html).not.toContain('data-slot="code-filename"');
  });

  test("renders ```mermaid fences via Mermaid (raw chart in SSR fallback, not Code)", () => {
    const body = "```mermaid\ngraph TD\n  A --> B\n```";
    const html = renderToString(createElement(MarkdownDoc, { body }));
    // mermaid renders client-side. Before SSR/mount, the raw code is emitted as <pre data-slot="mermaid">
    expect(html).toContain('data-slot="mermaid"');
    expect(html).toContain("graph TD");
    // does not delegate to Code (pierre File)
    expect(html).not.toContain("<diffs-container");
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

  test("renders GFM tables as shadcn Table (remark-gfm)", () => {
    const body = [
      "| Name | Score |",
      "| ---- | ----- |",
      "| Alice | 10 |",
      "| Bob | 20 |",
    ].join("\n");
    const html = renderToString(createElement(MarkdownDoc, { body }));
    // renders via the shadcn Table component
    expect(html).toContain("data-slot=\"table\"");
    expect(html).toContain("data-slot=\"table-header\"");
    expect(html).toContain("data-slot=\"table-head\"");
    expect(html).toContain("data-slot=\"table-cell\"");
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

  test("renders GFM task lists as shadcn Checkbox (read-only, state-mapped)", () => {
    const body = ["- [x] done", "- [ ] todo"].join("\n");
    const html = renderToString(createElement(MarkdownDoc, { body }));
    // renders via the shadcn (base-ui) Checkbox, not a native input
    expect(html).toContain("data-slot=\"checkbox\"");
    expect(html).toContain("role=\"checkbox\"");
    // display-only, not editable
    expect(html).toContain("aria-readonly=\"true\"");
    // [x] / [ ] map to checked / unchecked
    expect(html).toContain("data-checked");
    expect(html).toContain("data-unchecked");
    expect(html).toContain("done");
    expect(html).toContain("todo");
  });

  test("task-list <ul> drops the disc bullet (list-none, no list-disc)", () => {
    const body = ["- [x] done", "- [ ] todo"].join("\n");
    const html = renderToString(createElement(MarkdownDoc, { body }));
    // a checkbox item must not also carry a disc bullet
    expect(html).toContain("list-none");
    // a normal list keeps list-disc as before
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
