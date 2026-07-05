import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { CopyButton } from ".";

describe("CopyButton", () => {
  test("renders a button labelled 'Copy code' in its initial state", () => {
    const html = renderToString(createElement(CopyButton, { code: "x" }));
    expect(html).toContain('data-slot="code-copy"');
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Copy code"');
  });

  test("merges the passed className for placement", () => {
    const html = renderToString(
      createElement(CopyButton, { code: "x", className: "absolute top-1.5" }),
    );
    expect(html).toContain("absolute");
    expect(html).toContain("top-1.5");
  });
});
