import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ViewList } from "./ViewList";

const sample = [
  { id: "abc", title: "今日のRSS", createdAt: "2026-05-21T03:04:00Z" },
  {
    id: "def",
    title: "PR review",
    createdAt: "2026-05-20T10:00:00Z",
    source: { label: "gh" },
  },
];

describe("ViewList", () => {
  test("renders one link per snapshot pointing at /views/:id", () => {
    const html = renderToString(
      createElement(ViewList, { items: sample, currentId: null }),
    );
    expect(html).toContain('href="/views/abc"');
    expect(html).toContain('href="/views/def"');
    expect(html).toContain("今日のRSS");
    expect(html).toContain("PR review");
  });

  test("marks the current snapshot with aria-current", () => {
    const html = renderToString(
      createElement(ViewList, { items: sample, currentId: "def" }),
    );
    // active 行だけ aria-current="page" を持つ
    expect(html.match(/aria-current="page"/g)?.length).toBe(1);
  });

  test("shows the source label when present", () => {
    const html = renderToString(
      createElement(ViewList, { items: sample, currentId: null }),
    );
    expect(html).toContain("gh");
  });

  test("renders an empty state when there are no snapshots", () => {
    const html = renderToString(
      createElement(ViewList, { items: [], currentId: null }),
    );
    expect(html).toContain('data-slot="view-list-empty"');
    expect(html).not.toContain('data-slot="view-list"');
  });

  test("falls back to (untitled) when title is absent", () => {
    const html = renderToString(
      createElement(ViewList, {
        items: [{ id: "x", createdAt: "2026-05-21T03:04:00Z" }],
        currentId: null,
      }),
    );
    expect(html).toContain("(untitled)");
  });
});
