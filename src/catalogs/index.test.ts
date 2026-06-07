import { describe, expect, test } from "bun:test";
import { type ItemComponent, components, itemSchema, specs } from ".";
import { Card } from "./Card";
import { Heading } from "./Heading";
import { Link } from "./Link";
import { MarkdownDoc } from "./MarkdownDoc";
import { PlainText } from "./PlainText";
import { Stack } from "./Stack";
import { Text } from "./Text";
import { Time } from "./Time";

// Map に格納された component は ItemComponent に widening 済み。
// テスト側では識別性 (=== 比較) のみ意味があるので同型へ寄せる。
const asItem = (c: unknown) => c as ItemComponent;

describe("catalog", () => {
  test("exposes component specs by type", () => {
    expect(specs.get("Stack")?.type).toBe("Stack");
    expect(specs.get("Card")?.type).toBe("Card");
    expect(specs.get("Heading")?.type).toBe("Heading");
    expect(specs.get("Link")?.type).toBe("Link");
    expect(specs.get("Text")?.type).toBe("Text");
    expect(specs.get("Time")?.type).toBe("Time");
    expect(specs.get("MarkdownDoc")?.type).toBe("MarkdownDoc");
    expect(specs.get("PlainText")?.type).toBe("PlainText");
  });

  test("itemSchema parses a Card containing Heading/Text children", () => {
    const parsed = itemSchema.parse({
      type: "Card",
      props: {},
      children: [
        {
          type: "Heading",
          props: { text: "Title", level: 3, href: "https://example.com/" },
        },
        { type: "Text", props: { body: "summary", muted: true, clamp: true } },
      ],
    });
    expect(parsed.type).toBe("Card");
    expect(parsed.children?.length).toBe(2);
  });

  test("itemSchema rejects unknown component types", () => {
    const result = itemSchema.safeParse({ type: "DoesNotExist", props: {} });
    expect(result.success).toBe(false);
  });

  test("components map exposes registered React components by type", () => {
    expect(components.get("Stack")).toBe(asItem(Stack));
    expect(components.get("Card")).toBe(asItem(Card));
    expect(components.get("Heading")).toBe(asItem(Heading));
    expect(components.get("Link")).toBe(asItem(Link));
    expect(components.get("Text")).toBe(asItem(Text));
    expect(components.get("Time")).toBe(asItem(Time));
    expect(components.get("MarkdownDoc")).toBe(asItem(MarkdownDoc));
    expect(components.get("PlainText")).toBe(asItem(PlainText));
    expect(components.get("Missing")).toBeUndefined();
    expect(components.size).toBe(8);
  });

  test("Heading requires text and is strict", () => {
    expect(
      itemSchema.safeParse({ type: "Heading", props: { text: "H" } }).success,
    ).toBe(true);
    expect(itemSchema.safeParse({ type: "Heading", props: {} }).success).toBe(
      false,
    );
    expect(
      itemSchema.safeParse({
        type: "Heading",
        props: { text: "H", extra: "x" },
      }).success,
    ).toBe(false);
  });

  test("Heading level only accepts 1..3", () => {
    expect(
      itemSchema.safeParse({ type: "Heading", props: { text: "H", level: 2 } })
        .success,
    ).toBe(true);
    expect(
      itemSchema.safeParse({ type: "Heading", props: { text: "H", level: 4 } })
        .success,
    ).toBe(false);
  });

  test("Heading href must be a url", () => {
    expect(
      itemSchema.safeParse({
        type: "Heading",
        props: { text: "H", href: "https://example.com/" },
      }).success,
    ).toBe(true);
    expect(
      itemSchema.safeParse({
        type: "Heading",
        props: { text: "H", href: "not a url" },
      }).success,
    ).toBe(false);
  });

  test("Link requires a url href", () => {
    expect(
      itemSchema.safeParse({
        type: "Link",
        props: { href: "https://example.com/" },
      }).success,
    ).toBe(true);
    expect(
      itemSchema.safeParse({ type: "Link", props: { href: "nope" } }).success,
    ).toBe(false);
  });

  test("Text requires a body and is strict", () => {
    expect(
      itemSchema.safeParse({ type: "Text", props: { body: "x" } }).success,
    ).toBe(true);
    expect(itemSchema.safeParse({ type: "Text", props: {} }).success).toBe(
      false,
    );
    expect(
      itemSchema.safeParse({ type: "Text", props: { body: "x", foo: 1 } })
        .success,
    ).toBe(false);
  });

  test("Stack props is strict (rejects unknown fields)", () => {
    const result = itemSchema.safeParse({
      type: "Stack",
      props: { direction: "vertical", extra: "nope" },
    });
    expect(result.success).toBe(false);
  });

  test("MarkdownDoc requires a body string", () => {
    const ok = itemSchema.safeParse({
      type: "MarkdownDoc",
      props: { body: "# title" },
    });
    expect(ok.success).toBe(true);
    const missing = itemSchema.safeParse({ type: "MarkdownDoc", props: {} });
    expect(missing.success).toBe(false);
  });

  test("PlainText requires a body string and is strict", () => {
    expect(
      itemSchema.safeParse({ type: "PlainText", props: { body: "raw" } })
        .success,
    ).toBe(true);
    expect(itemSchema.safeParse({ type: "PlainText", props: {} }).success).toBe(
      false,
    );
    expect(
      itemSchema.safeParse({
        type: "PlainText",
        props: { body: "x", lang: "ts" },
      }).success,
    ).toBe(false);
  });

  test("Card accepts arbitrary catalog children", () => {
    const ok = itemSchema.safeParse({
      type: "Card",
      props: {},
      children: [{ type: "Text", props: { body: "x" } }],
    });
    expect(ok.success).toBe(true);
  });

  test("leaf components reject children (childrenTypes: [])", () => {
    const withChild = (type: string, props: Record<string, unknown>) =>
      itemSchema.safeParse({
        type,
        props,
        children: [{ type: "Text", props: { body: "x" } }],
      }).success;
    expect(withChild("Heading", { text: "H" })).toBe(false);
    expect(withChild("Text", { body: "x" })).toBe(false);
    expect(withChild("Time", { datetime: "2026-05-21T03:04:00Z" })).toBe(false);
    expect(withChild("Link", { href: "https://example.com/" })).toBe(false);
    expect(withChild("MarkdownDoc", { body: "x" })).toBe(false);
    expect(withChild("PlainText", { body: "x" })).toBe(false);
  });

  test("Time requires an ISO datetime and is strict", () => {
    expect(
      itemSchema.safeParse({
        type: "Time",
        props: { datetime: "2026-05-21T03:04:00Z" },
      }).success,
    ).toBe(true);
    expect(
      itemSchema.safeParse({ type: "Time", props: { datetime: "not a date" } })
        .success,
    ).toBe(false);
    expect(itemSchema.safeParse({ type: "Time", props: {} }).success).toBe(
      false,
    );
  });

  test("Heading/Link href reject non-http(s) protocols (XSS guard)", () => {
    expect(
      itemSchema.safeParse({
        type: "Heading",
        props: { text: "H", href: "javascript:alert(1)" },
      }).success,
    ).toBe(false);
    expect(
      itemSchema.safeParse({
        type: "Link",
        props: { href: "javascript:alert(1)" },
      }).success,
    ).toBe(false);
    expect(
      itemSchema.safeParse({
        type: "Link",
        props: { href: "https://example.com/" },
      }).success,
    ).toBe(true);
  });
});
