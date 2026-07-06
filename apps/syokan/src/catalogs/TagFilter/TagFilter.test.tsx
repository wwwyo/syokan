import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { TagFilter, tagFilterPropsSchema } from ".";
import { Render } from "../../Render";

describe("tagFilterPropsSchema", () => {
  test("requires at least one tag", () => {
    expect(tagFilterPropsSchema.safeParse({ tags: [] }).success).toBe(false);
    expect(
      tagFilterPropsSchema.safeParse({ tags: ["High"], label: "Severity" })
        .success,
    ).toBe(true);
  });
});

describe("TagFilter", () => {
  test("renders one chip per tag plus optional label", () => {
    const html = renderToString(
      createElement(TagFilter, { tags: ["High", "Medium"], label: "Severity" }),
    );
    expect(html).toContain("High");
    expect(html).toContain("Medium");
    expect(html).toContain("Severity");
    const chips = (html.match(/data-slot="tag-filter-chip"/g) ?? []).length;
    expect(chips).toBe(2);
  });

  test("with no selection, tagged descendants stay visible", () => {
    const html = renderToString(
      createElement(
        TagFilter,
        { tags: ["High"] },
        createElement(Render, {
          item: {
            type: "Text",
            props: { body: "a high finding" },
            tags: ["High"],
          },
        }),
      ),
    );
    expect(html).toContain("a high finding");
    expect(html).not.toContain("display:none");
  });
});
