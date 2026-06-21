import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import type { SnapshotEnvelope } from "@/schema";
import { ViewError, ViewNotFound, ViewPage, ViewPending } from "./ViewPage";

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

function render(env: SnapshotEnvelope): string {
  return renderToString(createElement(ViewPage, { envelope: env }));
}

function renderWithDelete(env: SnapshotEnvelope): string {
  return renderToString(
    createElement(ViewPage, { envelope: env, onDelete: () => {} }),
  );
}

describe("ViewPage", () => {
  test("renders the snapshot root via Render", () => {
    const html = render(envelope);
    expect(html).toContain("Hello");
    expect(html).toContain("Intro");
  });

  test("displays metadata.source.label when present", () => {
    const html = render({
      ...envelope,
      metadata: { source: { label: "rss-daily" } },
    });
    expect(html).toContain("rss-daily");
  });

  test("omits source label when absent", () => {
    const html = render(envelope);
    expect(html).not.toContain("view-source");
  });

  test("shows the actions-menu trigger when onDelete is provided", () => {
    const html = renderWithDelete(envelope);
    // 削除はメニュー内に隠れる。SSR では trigger だけが出る
    expect(html).toContain("view-menu-trigger");
  });

  test("omits the actions-menu trigger when no onDelete handler is given", () => {
    const html = render(envelope);
    expect(html).not.toContain("view-menu-trigger");
    expect(html).not.toContain("view-delete");
  });

  test("resizable Stack root expands full-bleed (drops max-w constraint)", () => {
    const html = render({
      ...envelope,
      root: {
        type: "Stack",
        props: { resizable: true, direction: "horizontal" },
        children: [
          { type: "Heading", props: { text: "L" } },
          { type: "Heading", props: { text: "R" } },
        ],
      },
    });
    expect(html).not.toContain("max-w-4xl");
  });

  test("non-resizable root stays width-constrained (max-w-4xl)", () => {
    const html = render(envelope);
    expect(html).toContain("max-w-4xl");
  });
});

describe("ViewPending / ViewNotFound / ViewError", () => {
  test("pending shows a placeholder", () => {
    const html = renderToString(createElement(ViewPending));
    expect(html).toContain("Loading");
  });

  test("not-found shows 404 and the id", () => {
    const html = renderToString(
      createElement(ViewNotFound, { id: "missing-id" }),
    );
    expect(html).toContain("404");
    expect(html).toContain("missing-id");
  });

  test("error shows the message", () => {
    const html = renderToString(
      createElement(ViewError, { message: "boom" }),
    );
    expect(html).toContain("boom");
    expect(html).toContain("view-error");
  });
});
