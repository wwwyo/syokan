import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Card, cardPropsSchema } from ".";

describe("cardPropsSchema", () => {
  test("title is optional and strict", () => {
    expect(cardPropsSchema.safeParse({}).success).toBe(true);
    expect(cardPropsSchema.safeParse({ title: "T" }).success).toBe(true);
    expect(cardPropsSchema.safeParse({ title: "" }).success).toBe(false);
    expect(cardPropsSchema.safeParse({ extra: 1 }).success).toBe(false);
  });
});

describe("Card", () => {
  test("wraps children in the content slot", () => {
    const html = renderToString(createElement(Card, { children: "inside" }));
    expect(html).toContain('data-slot="card"');
    expect(html).toContain('data-slot="card-content"');
    expect(html).toContain("inside");
    expect(html).toContain("ring-1");
  });

  test("renders the title in the header slot when given", () => {
    const html = renderToString(
      createElement(Card, { title: "Finding", children: "body" }),
    );
    expect(html).toContain('data-slot="card-header"');
    expect(html).toContain('data-slot="card-title"');
    expect(html).toContain("Finding");
  });

  test("omits the header slot without a title", () => {
    const html = renderToString(createElement(Card, { children: "body" }));
    expect(html).not.toContain('data-slot="card-header"');
  });
});
