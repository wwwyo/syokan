import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import type { SnapshotEnvelope } from "@/schema";
import { ViewPage, type ViewPageState } from "./ViewPage";

function render(state: ViewPageState): string {
  return renderToString(createElement(ViewPage, { state }));
}

function renderWithDelete(state: ViewPageState): string {
  return renderToString(createElement(ViewPage, { state, onDelete: () => {} }));
}

const envelope: SnapshotEnvelope = {
  schemaVersion: 1,
  id: "abc-123",
  title: "Sample",
  createdAt: "2026-05-21T03:04:00Z",
  root: {
    type: "Stack",
    props: {},
    children: [
      { type: "Heading", props: { text: "Hello" } },
      { type: "Heading", props: { text: "Intro" } },
    ],
  },
};

describe("ViewPage", () => {
  test("renders the snapshot root via Render", () => {
    const html = render({ kind: "found", envelope });
    expect(html).toContain("Hello");
    expect(html).toContain("Intro");
  });

  test("displays metadata.source.label when present", () => {
    const html = render({
      kind: "found",
      envelope: {
        ...envelope,
        metadata: { source: { label: "rss-daily" } },
      },
    });
    expect(html).toContain("rss-daily");
  });

  test("omits source label when absent", () => {
    const html = render({ kind: "found", envelope });
    expect(html).not.toContain("view-source");
  });

  test("shows the actions-menu trigger when onDelete is provided", () => {
    const html = renderWithDelete({ kind: "found", envelope });
    // 削除はメニュー内に隠れる。SSR では trigger だけが出る
    expect(html).toContain("view-menu-trigger");
  });

  test("omits the actions-menu trigger when no onDelete handler is given", () => {
    const html = render({ kind: "found", envelope });
    expect(html).not.toContain("view-menu-trigger");
    expect(html).not.toContain("view-delete");
  });

  test("not-found state shows 404 and the id", () => {
    const html = render({ kind: "not-found", id: "missing-id" });
    expect(html).toContain("404");
    expect(html).toContain("missing-id");
  });

  test("loading state shows a placeholder", () => {
    const html = render({ kind: "loading" });
    expect(html).toContain("Loading");
  });

  test("resizable Stack root expands full-bleed (drops max-w constraint)", () => {
    const html = render({
      kind: "found",
      envelope: {
        ...envelope,
        root: {
          type: "Stack",
          props: { resizable: true, direction: "horizontal" },
          children: [
            { type: "Heading", props: { text: "L" } },
            { type: "Heading", props: { text: "R" } },
          ],
        },
      },
    });
    expect(html).not.toContain("max-w-4xl");
  });

  test("non-resizable root stays width-constrained (max-w-4xl)", () => {
    const html = render({ kind: "found", envelope });
    expect(html).toContain("max-w-4xl");
  });
});
