import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { PlainText } from ".";

describe("PlainText", () => {
  test("delegates to CodeBlock (body は client 側 File で等幅描画)", () => {
    const body = "# not a heading\n* not a bullet\n  indented log line";
    const html = renderToString(createElement(PlainText, { body }));
    expect(html).toContain('data-slot="plain-text"');
    // CodeBlock (= @pierre/diffs File) に委譲。コード本体は client 描画なので SSR は host のみ。
    expect(html).toContain('data-slot="codeblock"');
    expect(html).toContain("<diffs-container");
  });

  test("does not interpret markdown syntax (delegates to CodeBlock, not ReactMarkdown)", () => {
    const body = "# title-like\n* item-like";
    const html = renderToString(createElement(PlainText, { body }));
    // markdown 解釈しない (h1/ul を作らない)。CodeBlock 経由で等幅表示する。
    expect(html).toContain('data-slot="codeblock"');
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<ul");
  });
});
