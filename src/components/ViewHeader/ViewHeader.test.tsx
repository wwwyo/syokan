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
    // 削除はメニュー (Portal, 既定で閉) の中なので SSR には trigger だけが出る。
    // open → Delete クリックの動作はブラウザ確認で担保する。
    expect(withDelete).toContain("data-slot=\"view-menu-trigger\"");
    expect(withDelete).toContain("aria-haspopup=\"menu\"");

    const without = renderToString(createElement(ViewHeader, {}));
    expect(without).not.toContain("view-menu-trigger");
    expect(without).not.toContain("view-delete");
  });
});
