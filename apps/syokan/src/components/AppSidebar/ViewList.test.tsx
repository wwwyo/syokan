import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ViewList } from "./ViewList";

const sample = [
  { id: "abc", title: "Daily RSS", createdAt: "2026-05-21T03:04:00Z" },
  {
    id: "def",
    title: "PR review",
    createdAt: "2026-05-20T10:00:00Z",
  },
];

describe("ViewList", () => {
  test("renders one link per snapshot pointing at /snapshots/:id", () => {
    const html = renderToString(
      createElement(ViewList, { items: sample, currentId: null }),
    );
    expect(html).toContain('href="/snapshots/abc"');
    expect(html).toContain('href="/snapshots/def"');
    expect(html).toContain("Daily RSS");
    expect(html).toContain("PR review");
  });

  test("marks the current snapshot with aria-current", () => {
    const html = renderToString(
      createElement(ViewList, { items: sample, currentId: "def" }),
    );
    expect(html.match(/aria-current="page"/g)?.length).toBe(1);
  });

  test("shows the creation date as a <time> bound to createdAt", () => {
    const html = renderToString(
      createElement(ViewList, { items: sample, currentId: null }),
    );
    expect(html).toContain('dateTime="2026-05-21T03:04:00Z"');
    // Human-readable text is TZ-dependent, so assert only the machine-readable side plus the date prefix
    expect(html).toMatch(/<time[^>]*>2026-05-2\d \d{2}:\d{2}<\/time>/);
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
