import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Notice, NoticeDetail } from ".";

describe("Notice", () => {
  test("emits the caller's data-slot so existing selectors keep matching", () => {
    const html = renderToString(
      createElement(Notice, { slot: "tree-doc-error", children: "boom" }),
    );
    expect(html).toContain('data-slot="tree-doc-error"');
    expect(html).toContain("boom");
  });

  test("merges the caller's margin without a baked-in default", () => {
    const standalone = renderToString(
      createElement(Notice, { slot: "x", className: "my-4", children: "a" }),
    );
    expect(standalone).toContain("my-4");

    const stacked = renderToString(
      createElement(Notice, { slot: "x", className: "mb-2", children: "a" }),
    );
    expect(stacked).toContain("mb-2");
    expect(stacked).not.toContain("my-4");
  });
});

describe("NoticeDetail", () => {
  test("break wraps anywhere in a paragraph", () => {
    const html = renderToString(
      createElement(NoticeDetail, {
        wrap: "break",
        children: "/a/very/long/path.json",
      }),
    );
    expect(html).toContain("<p");
    expect(html).toContain("break-all");
    expect(html).toContain("/a/very/long/path.json");
  });

  test("preserve keeps whitespace in a pre so a caret stays aligned", () => {
    const html = renderToString(
      createElement(NoticeDetail, {
        wrap: "preserve",
        children: "Parse error on line 2:\n  ^",
      }),
    );
    expect(html).toContain("<pre");
    expect(html).not.toContain("break-all");
    expect(html).toContain("  ^");
  });
});
