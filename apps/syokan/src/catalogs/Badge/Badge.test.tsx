import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Badge } from ".";

describe("Badge", () => {
  test("renders the text", () => {
    const html = renderToString(createElement(Badge, { text: "open" }));
    expect(html).toContain("open");
  });

  test("applies variant classes", () => {
    const html = renderToString(
      createElement(Badge, { text: "closed", variant: "destructive" }),
    );
    expect(html).toContain("text-destructive");
  });
});
