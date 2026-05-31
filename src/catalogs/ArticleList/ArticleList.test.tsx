import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ArticleCard } from "../ArticleCard";
import { ArticleList } from ".";

describe("ArticleList", () => {
  test("renders ArticleCard children stacked vertically", () => {
    const html = renderToString(
      createElement(
        ArticleList,
        {},
        createElement(ArticleCard, {
          key: "a",
          title: "First",
          url: "https://example.com/1",
        }),
        createElement(ArticleCard, {
          key: "b",
          title: "Second",
          url: "https://example.com/2",
        }),
      ),
    );
    expect(html).toContain("First");
    expect(html).toContain("Second");
    expect(html).toContain("flex-col");
  });

  test("renders empty state when there are no children", () => {
    const html = renderToString(createElement(ArticleList, {}));
    expect(html).toContain("No articles");
  });
});
