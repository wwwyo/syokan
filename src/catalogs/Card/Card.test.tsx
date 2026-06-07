import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Card } from ".";

describe("Card", () => {
  test("wraps children in a bordered card", () => {
    const html = renderToString(createElement(Card, { children: "inside" }));
    expect(html).toContain('data-slot="card"');
    expect(html).toContain("inside");
    expect(html).toContain("border");
  });
});
