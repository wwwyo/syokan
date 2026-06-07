import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { CodeBlock } from ".";

describe("CodeBlock", () => {
  test("renders the pierre File host with a copy button (code highlights client-side)", () => {
    const html = renderToString(
      createElement(CodeBlock, { code: "const x = 1;" }),
    );
    expect(html).toContain('data-slot="codeblock"');
    // コード本体は @pierre/diffs の File が client 側 (shadow DOM) で描画するため
    // SSR では host 要素のみ出る (Diff と同じ)。
    expect(html).toContain("<diffs-container");
    // CopyButton が配置される (ボタン自体の詳細は CopyButton.test)
    expect(html).toContain('data-slot="codeblock-copy"');
  });

  test("filename: renders a header row with the filename and a copy button", () => {
    const html = renderToString(
      createElement(CodeBlock, { code: "x", filename: "a.ts" }),
    );
    expect(html).toContain('data-slot="codeblock-filename"');
    expect(html).toContain("a.ts");
    expect(html).toContain('data-slot="codeblock-copy"');
  });
});
