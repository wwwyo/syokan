import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ArticleCard } from "./ArticleCard";

describe("ArticleCard", () => {
  test("renders title, url, summary, publishedAt", () => {
    const html = renderToString(
      createElement(ArticleCard, {
        title: "Hello world",
        url: "https://example.com/post/1",
        summary: "An interesting article about something.",
        publishedAt: "2026-05-21T01:23:45Z",
      }),
    );
    expect(html).toContain("Hello world");
    expect(html).toContain("https://example.com/post/1");
    expect(html).toContain("An interesting article");
  });

  test("title and url are wrapped in an anchor with href", () => {
    const html = renderToString(
      createElement(ArticleCard, {
        title: "Linked title",
        url: "https://example.com/article",
      }),
    );
    expect(html).toContain("<a");
    expect(html).toContain("href=\"https://example.com/article\"");
    expect(html).toContain("Linked title");
  });

  test("publishedAt renders inside a <time> element with dateTime attribute", () => {
    const html = renderToString(
      createElement(ArticleCard, {
        title: "T",
        url: "https://example.com/",
        publishedAt: "2026-05-21T12:34:00Z",
      }),
    );
    expect(html).toContain("<time");
    expect(html).toContain("dateTime=\"2026-05-21T12:34:00Z\"");
    expect(html).toContain("2026-05-21");
  });

  test("omits summary and time blocks when not provided", () => {
    const html = renderToString(
      createElement(ArticleCard, {
        title: "T",
        url: "https://example.com/",
      }),
    );
    expect(html).not.toContain("<time");
  });
});
