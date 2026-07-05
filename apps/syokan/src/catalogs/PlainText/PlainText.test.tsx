import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { PlainText } from ".";

describe("PlainText", () => {
  test("delegates to Code (body is rendered monospaced by the client-side File)", () => {
    const body = "# not a heading\n* not a bullet\n  indented log line";
    const html = renderToString(createElement(PlainText, { body }));
    expect(html).toContain('data-slot="plain-text"');
    // delegates to Code (= @pierre/diffs File). The code body renders client-side, so SSR emits only the host.
    expect(html).toContain('data-slot="code"');
    expect(html).toContain("<diffs-container");
  });

  test("does not interpret markdown syntax (delegates to Code, not ReactMarkdown)", () => {
    const body = "# title-like\n* item-like";
    const html = renderToString(createElement(PlainText, { body }));
    // no markdown interpretation (no h1/ul). Shown monospaced via Code.
    expect(html).toContain('data-slot="code"');
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<ul");
  });
});
