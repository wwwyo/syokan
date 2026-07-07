import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Stat, statPropsSchema } from ".";

describe("statPropsSchema", () => {
  test("accepts number and string values", () => {
    expect(statPropsSchema.safeParse({ label: "Unread", value: 12 }).success).toBe(true);
    expect(statPropsSchema.safeParse({ label: "Rate", value: "94%" }).success).toBe(true);
  });

  test("rejects unknown delta direction", () => {
    const result = statPropsSchema.safeParse({
      label: "x",
      value: 1,
      delta: { text: "+1", direction: "sideways" },
    });
    expect(result.success).toBe(false);
  });
});

describe("Stat", () => {
  test("renders label and value", () => {
    const html = renderToString(createElement(Stat, { label: "Unread", value: 12 }));
    expect(html).toContain("Unread");
    expect(html).toContain("12");
  });

  test("renders delta with direction color", () => {
    const html = renderToString(
      createElement(Stat, {
        label: "Unread",
        value: 12,
        delta: { text: "+3", direction: "up" as const },
      }),
    );
    expect(html).toContain("+3");
    expect(html).toContain("text-emerald-600");
  });

  test("omits delta block when not given", () => {
    const html = renderToString(createElement(Stat, { label: "x", value: 1 }));
    expect(html).not.toContain("stat-delta");
  });
});
