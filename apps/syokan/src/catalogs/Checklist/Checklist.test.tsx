import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Checklist, checklistPropsSchema } from ".";

describe("checklistPropsSchema", () => {
  test("accepts string and inline labels with optional checked", () => {
    const result = checklistPropsSchema.safeParse({
      items: [
        { label: "plain" },
        { label: { type: "Badge", props: { text: "High" } }, checked: true },
      ],
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty items and unknown item fields", () => {
    expect(checklistPropsSchema.safeParse({ items: [] }).success).toBe(false);
    expect(
      checklistPropsSchema.safeParse({
        items: [{ label: "x", note: "no" }],
      }).success,
    ).toBe(false);
  });
});

describe("Checklist", () => {
  test("renders items and the n/m progress from initial checked", () => {
    const html = renderToString(
      createElement(Checklist, {
        items: [
          { label: "one", checked: true },
          { label: "two" },
          { label: "three" },
        ],
      }),
    );
    expect(html).toContain("one");
    expect(html).toContain("1/3");
  });

  test("folds the body of an initially checked item", () => {
    const html = renderToString(
      createElement(
        Checklist,
        { items: [{ label: "done", checked: true }] },
        createElement("p", null, "detail body"),
      ),
    );
    // body stays in the DOM (anchor reveal needs it) but is hidden
    expect(html).toContain("detail body");
    expect(html).toContain("hidden");
  });

  test("shows the body of an unchecked item", () => {
    const html = renderToString(
      createElement(
        Checklist,
        { items: [{ label: "todo" }] },
        createElement("p", null, "detail body"),
      ),
    );
    expect(html).toContain("detail body");
    expect(html).not.toContain('class="ml-6.5 hidden"');
  });
});
