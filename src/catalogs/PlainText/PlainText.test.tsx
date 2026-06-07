import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { PlainText } from ".";

describe("PlainText", () => {
  test("delegates to Code (body は client 側 File で等幅描画)", () => {
    const body = "# not a heading\n* not a bullet\n  indented log line";
    const html = renderToString(createElement(PlainText, { body }));
    expect(html).toContain('data-slot="plain-text"');
    // Code (= @pierre/diffs File) に委譲。コード本体は client 描画なので SSR は host のみ。
    expect(html).toContain('data-slot="code"');
    expect(html).toContain("<diffs-container");
  });

  test("does not interpret markdown syntax (delegates to Code, not ReactMarkdown)", () => {
    const body = "# title-like\n* item-like";
    const html = renderToString(createElement(PlainText, { body }));
    // markdown 解釈しない (h1/ul を作らない)。Code 経由で等幅表示する。
    expect(html).toContain('data-slot="code"');
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<ul");
  });
});
