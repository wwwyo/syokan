import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ViewHeader } from ".";

describe("ViewHeader", () => {
  test("shows the source label when given", () => {
    const html = renderToString(
      createElement(ViewHeader, { sourceLabel: "rss-daily" }),
    );
    expect(html).toContain("data-slot=\"view-source\"");
    expect(html).toContain("rss-daily");
  });

  test("omits the source label when absent", () => {
    const html = renderToString(createElement(ViewHeader, {}));
    expect(html).not.toContain("view-source");
  });

  test("shows the actions-menu trigger only when onDelete is provided", () => {
    const withDelete = renderToString(
      createElement(ViewHeader, { onDelete: () => {} }),
    );
    // Delete lives inside the menu (Portal, closed by default), so only the trigger appears in SSR.
    // The open → Delete click behavior is covered by browser verification.
    expect(withDelete).toContain("data-slot=\"view-menu-trigger\"");
    expect(withDelete).toContain("aria-haspopup=\"menu\"");

    const without = renderToString(createElement(ViewHeader, {}));
    expect(without).not.toContain("view-menu-trigger");
    expect(without).not.toContain("view-delete");
  });

  test("shows the source toggle only when sourceToggle is provided", () => {
    const withToggle = renderToString(
      createElement(ViewHeader, {
        sourceToggle: { shown: true, onToggle: () => {} },
      }),
    );
    expect(withToggle).toContain("data-slot=\"view-source-toggle\"");
    expect(withToggle).toContain("aria-pressed=\"true\"");

    const without = renderToString(createElement(ViewHeader, {}));
    expect(without).not.toContain("view-source-toggle");
  });

  test("shows the share controls only when snapshotId is provided", () => {
    const withId = renderToString(
      createElement(ViewHeader, { snapshotId: "k3f9q2" }),
    );
    expect(withId).toContain("data-slot=\"share-button\"");

    const without = renderToString(createElement(ViewHeader, {}));
    expect(without).not.toContain("share-button");
  });
});
