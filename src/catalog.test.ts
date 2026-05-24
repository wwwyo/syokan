import { describe, expect, test } from "bun:test";
import {
  ArticleCardSpec,
  ArticleListSpec,
  MarkdownDocSpec,
  PageSpec,
  SectionSpec,
  type ItemComponent,
  components,
  itemSchema,
} from "./catalog";
import { ArticleCard } from "./components/ArticleCard";
import { ArticleList } from "./components/ArticleList";
import { MarkdownDoc } from "./components/MarkdownDoc";
import { Page } from "./components/Page";
import { Section } from "./components/Section";

// Map に格納された component は ItemComponent に widening 済み。
// テスト側では識別性 (=== 比較) のみ意味があるので同型へ寄せる。
const asItem = (c: unknown) => c as ItemComponent;

describe("catalog", () => {
  test("exposes component specs", () => {
    expect(PageSpec.type).toBe("Page");
    expect(SectionSpec.type).toBe("Section");
    expect(MarkdownDocSpec.type).toBe("MarkdownDoc");
    expect(ArticleCardSpec.type).toBe("ArticleCard");
    expect(ArticleListSpec.type).toBe("ArticleList");
  });

  test("itemSchema parses a Page containing Section children", () => {
    const parsed = itemSchema.parse({
      type: "Page",
      props: { title: "Top" },
      children: [
        { type: "Section", props: { heading: "S1" } },
        { type: "Section", props: { heading: "S2" } },
      ],
    });
    expect(parsed.type).toBe("Page");
    expect(parsed.children?.length).toBe(2);
  });

  test("itemSchema rejects unknown component types", () => {
    const result = itemSchema.safeParse({ type: "DoesNotExist", props: {} });
    expect(result.success).toBe(false);
  });

  test("components map exposes registered React components by type", () => {
    expect(components.get("Page")).toBe(asItem(Page));
    expect(components.get("Section")).toBe(asItem(Section));
    expect(components.get("MarkdownDoc")).toBe(asItem(MarkdownDoc));
    expect(components.get("ArticleCard")).toBe(asItem(ArticleCard));
    expect(components.get("ArticleList")).toBe(asItem(ArticleList));
    expect(components.get("Missing")).toBeUndefined();
    expect(components.size).toBe(5);
  });

  test("page props is strict (rejects unknown fields)", () => {
    const result = itemSchema.safeParse({
      type: "Page",
      props: { title: "T", extra: "nope" },
    });
    expect(result.success).toBe(false);
  });

  test("section props is strict (rejects unknown fields)", () => {
    const result = itemSchema.safeParse({
      type: "Section",
      props: { heading: "H", extra: "nope" },
    });
    expect(result.success).toBe(false);
  });

  test("MarkdownDoc requires a body string", () => {
    const ok = itemSchema.safeParse({
      type: "MarkdownDoc",
      props: { body: "# title" },
    });
    expect(ok.success).toBe(true);
    const missing = itemSchema.safeParse({
      type: "MarkdownDoc",
      props: {},
    });
    expect(missing.success).toBe(false);
  });

  test("ArticleCard accepts title/url and optional summary/publishedAt", () => {
    const ok = itemSchema.safeParse({
      type: "ArticleCard",
      props: {
        title: "Hi",
        url: "https://example.com/",
        summary: "x",
        publishedAt: "2026-05-21T00:00:00Z",
      },
    });
    expect(ok.success).toBe(true);
    const badUrl = itemSchema.safeParse({
      type: "ArticleCard",
      props: { title: "Hi", url: "not a url" },
    });
    expect(badUrl.success).toBe(false);
  });

  test("ArticleList only accepts ArticleCard children", () => {
    const ok = itemSchema.safeParse({
      type: "ArticleList",
      props: {},
      children: [
        {
          type: "ArticleCard",
          props: { title: "a", url: "https://example.com/1" },
        },
      ],
    });
    expect(ok.success).toBe(true);

    const reject = itemSchema.safeParse({
      type: "ArticleList",
      props: {},
      children: [{ type: "Section", props: { heading: "x" } }],
    });
    expect(reject.success).toBe(false);
  });

  test("ArticleList allows empty children", () => {
    const ok = itemSchema.safeParse({
      type: "ArticleList",
      props: {},
      children: [],
    });
    expect(ok.success).toBe(true);
  });
});
