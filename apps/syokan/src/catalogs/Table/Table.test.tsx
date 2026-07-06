import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Table, tablePropsSchema } from ".";

describe("tablePropsSchema", () => {
  test("accepts string cells and inline nodes", () => {
    const result = tablePropsSchema.safeParse({
      columns: ["PR", "State"],
      rows: [
        [
          "plain",
          { type: "Badge", props: { text: "open" } },
        ],
      ],
    });
    expect(result.success).toBe(true);
  });

  test("rejects non-inline node types in cells", () => {
    const result = tablePropsSchema.safeParse({
      columns: ["A"],
      rows: [[{ type: "Card", props: {} }]],
    });
    expect(result.success).toBe(false);
  });

  test("requires at least one column", () => {
    expect(tablePropsSchema.safeParse({ columns: [], rows: [] }).success).toBe(
      false,
    );
  });
});

describe("Table", () => {
  test("renders header and body cells", () => {
    const html = renderToString(
      createElement(Table, {
        columns: ["Feed", "Unread"],
        rows: [["Hacker News", "12"]],
      }),
    );
    expect(html).toContain("Feed");
    expect(html).toContain("Hacker News");
    expect(html).toContain("12");
  });

  test("pads ragged rows to the column count", () => {
    const html = renderToString(
      createElement(Table, { columns: ["A", "B"], rows: [["only-a"]] }),
    );
    const cellCount = (html.match(/<td/g) ?? []).length;
    expect(cellCount).toBe(2);
  });

  test("renders inline nodes inside cells", () => {
    const html = renderToString(
      createElement(Table, {
        columns: ["State"],
        rows: [[{ type: "Badge" as const, props: { text: "merged" } }]],
      }),
    );
    expect(html).toContain("merged");
  });
});
