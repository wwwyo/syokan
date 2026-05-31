import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { CodeBlock } from ".";

describe("CodeBlock", () => {
  test("renders the raw code with a copy button (fallback before highlight)", () => {
    const html = renderToString(
      createElement(CodeBlock, { code: "const x = 1;" }),
    );
    expect(html).toContain('data-slot="codeblock"');
    expect(html).toContain("const x = 1;");
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
