import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Badge, badgePropsSchema } from ".";

describe("badgePropsSchema", () => {
  test("accepts success/warning/info variants", () => {
    expect(
      badgePropsSchema.safeParse({ text: "ok", variant: "success" }).success,
    ).toBe(true);
    expect(
      badgePropsSchema.safeParse({ text: "ok", variant: "warning" }).success,
    ).toBe(true);
    expect(
      badgePropsSchema.safeParse({ text: "ok", variant: "info" }).success,
    ).toBe(true);
  });

  test("rejects an unknown variant", () => {
    expect(
      badgePropsSchema.safeParse({ text: "ok", variant: "fancy" }).success,
    ).toBe(false);
  });
});

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

  test("applies success/warning/info variant classes", () => {
    const success = renderToString(
      createElement(Badge, { text: "pass", variant: "success" }),
    );
    expect(success).toContain("text-emerald-700");

    const warning = renderToString(
      createElement(Badge, { text: "medium", variant: "warning" }),
    );
    expect(warning).toContain("text-amber-700");

    const info = renderToString(
      createElement(Badge, { text: "note", variant: "info" }),
    );
    expect(info).toContain("text-sky-700");
  });
});
