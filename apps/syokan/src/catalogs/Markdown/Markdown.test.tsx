import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Markdown, markdownPropsSchema } from ".";

describe("markdownPropsSchema", () => {
  test("accepts multi-paragraph prose with bold/links/lists/fence/blockquote", () => {
    const body = [
      "First paragraph with **bold** text and a [link](https://example.com/).",
      "",
      "- one",
      "- two",
      "  - nested",
      "",
      "```ts",
      "const x = 1;",
      "```",
      "",
      "> a quote",
    ].join("\n");
    expect(markdownPropsSchema.safeParse({ body }).success).toBe(true);
  });

  test("rejects missing body and unknown keys (strict)", () => {
    expect(markdownPropsSchema.safeParse({}).success).toBe(false);
    expect(markdownPropsSchema.safeParse({ body: "" }).success).toBe(false);
    expect(
      markdownPropsSchema.safeParse({ body: "x", extra: 1 }).success,
    ).toBe(false);
  });

  test("rejects a heading, naming the Heading catalog node", () => {
    const result = markdownPropsSchema.safeParse({ body: "# Title" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("Heading catalog node");
  });

  test("rejects a GFM table, naming the Table catalog node", () => {
    const body = ["| A | B |", "| - | - |", "| 1 | 2 |"].join("\n");
    const result = markdownPropsSchema.safeParse({ body });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("Table catalog node");
  });

  test("rejects a task list item, naming the Checklist catalog node", () => {
    const result = markdownPropsSchema.safeParse({ body: "- [ ] todo" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("Checklist catalog node");
  });

  test("rejects inline HTML", () => {
    const result = markdownPropsSchema.safeParse({
      body: "prose with <b>raw html</b> inline",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("raw HTML");
  });

  test("rejects block HTML", () => {
    const result = markdownPropsSchema.safeParse({
      body: "<div>\n\nblock html\n\n</div>",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("raw HTML");
  });

  test("rejects images", () => {
    const result = markdownPropsSchema.safeParse({
      body: "![alt](https://example.com/pic.png)",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("images are not supported");
  });

  test("rejects javascript: links", () => {
    const result = markdownPropsSchema.safeParse({
      body: "[click me](javascript:alert(1))",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("http(s)");
  });

  test("rejects relative links", () => {
    const result = markdownPropsSchema.safeParse({
      body: "[relative](./notes.md)",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("http(s)");
  });

  test("catches a heading nested inside a list item body", () => {
    // marked re-lexes list item text as block tokens, so a heading buried in a list
    // item is a real bypass risk if the walk only checked the top level.
    const result = markdownPropsSchema.safeParse({
      body: "- top\n\n  # nested heading",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("Heading catalog node");
  });
});

describe("Markdown", () => {
  test("renders paragraphs, bold, and links", () => {
    const html = renderToString(
      createElement(Markdown, {
        body: "Hello **world**, see [docs](https://example.com/).",
      }),
    );
    expect(html).toContain('data-slot="markdown"');
    expect(html).toContain("<strong>world</strong>");
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('target="_blank"');
  });

  test("renders a plain (non-task) list", () => {
    const html = renderToString(
      createElement(Markdown, { body: "- one\n- two" }),
    );
    expect(html).toContain("<ul");
    expect(html).toContain("one");
    expect(html).toContain("two");
  });

  test("renders a fenced code block via the Code catalog component", () => {
    const html = renderToString(
      createElement(Markdown, { body: "```ts\nconst x = 1;\n```" }),
    );
    expect(html).toContain('data-slot="code"');
  });

  test("renders a blockquote", () => {
    const html = renderToString(
      createElement(Markdown, { body: "> quoted text" }),
    );
    expect(html).toContain("<blockquote");
    expect(html).toContain("quoted text");
  });

  test("never uses dangerouslySetInnerHTML", async () => {
    const source = await Bun.file(`${import.meta.dir}/index.tsx`).text();
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });
});
