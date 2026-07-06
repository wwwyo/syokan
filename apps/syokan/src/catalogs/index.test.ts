import { describe, expect, test } from "bun:test";
import { type ItemComponent, components, itemSchema, specs } from ".";
import { Badge } from "./Badge";
import { Card } from "./Card";
import { Checklist } from "./Checklist";
import { Code } from "./Code";
import { Collapsible } from "./Collapsible";
import { Diff } from "./Diff";
import { Graph } from "./Graph";
import { Heading } from "./Heading";
import { Link } from "./Link";
import { Mermaid } from "./Mermaid";
import { PlainText } from "./PlainText";
import { Probe } from "./Probe";
import { Stack } from "./Stack";
import { Stat } from "./Stat";
import { Table } from "./Table";
import { TagFilter } from "./TagFilter";
import { Text } from "./Text";
import { Time } from "./Time";
import { TreeDoc } from "./TreeDoc";

// components stored in the Map are widened to ItemComponent.
// On the test side only identity (=== comparison) matters, so coerce to the same type.
const asItem = (c: unknown) => c as ItemComponent;

describe("catalog", () => {
  test("exposes component specs by type", () => {
    expect(specs.get("Stack")?.type).toBe("Stack");
    expect(specs.get("Card")?.type).toBe("Card");
    expect(specs.get("Heading")?.type).toBe("Heading");
    expect(specs.get("Link")?.type).toBe("Link");
    expect(specs.get("Text")?.type).toBe("Text");
    expect(specs.get("Time")?.type).toBe("Time");
    expect(specs.get("PlainText")?.type).toBe("PlainText");
    expect(specs.get("Diff")?.type).toBe("Diff");
    expect(specs.get("Code")?.type).toBe("Code");
    expect(specs.get("Badge")?.type).toBe("Badge");
    expect(specs.get("Mermaid")?.type).toBe("Mermaid");
    expect(specs.get("TreeDoc")?.type).toBe("TreeDoc");
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
    expect(components.get("PlainText")).toBe(asItem(PlainText));
    expect(components.get("Diff")).toBe(asItem(Diff));
    expect(components.get("Code")).toBe(asItem(Code));
    expect(components.get("Badge")).toBe(asItem(Badge));
    expect(components.get("Mermaid")).toBe(asItem(Mermaid));
    expect(components.get("TreeDoc")).toBe(asItem(TreeDoc));
    expect(components.get("Table")).toBe(asItem(Table));
    expect(components.get("Stat")).toBe(asItem(Stat));
    expect(components.get("Checklist")).toBe(asItem(Checklist));
    expect(components.get("Collapsible")).toBe(asItem(Collapsible));
    expect(components.get("TagFilter")).toBe(asItem(TagFilter));
    expect(components.get("Graph")).toBe(asItem(Graph));
    expect(components.get("Probe")).toBe(asItem(Probe));
    expect(components.get("MarkdownDoc")).toBeUndefined();
    expect(components.get("FileDoc")).toBeUndefined();
    expect(components.size).toBe(19);
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

  test("MarkdownDoc / FileDoc are no longer accepted (removed types)", () => {
    expect(
      itemSchema.safeParse({ type: "MarkdownDoc", props: { body: "# title" } })
        .success,
    ).toBe(false);
    expect(
      itemSchema.safeParse({ type: "FileDoc", props: { path: "/a/notes.md" } })
        .success,
    ).toBe(false);
  });

  test("Mermaid requires a code string and is strict", () => {
    expect(
      itemSchema.safeParse({ type: "Mermaid", props: { code: "graph TD; A-->B" } })
        .success,
    ).toBe(true);
    expect(itemSchema.safeParse({ type: "Mermaid", props: {} }).success).toBe(
      false,
    );
    expect(
      itemSchema.safeParse({ type: "Mermaid", props: { code: "x", theme: "d" } })
        .success,
    ).toBe(false);
  });

  test("TreeDoc requires an absolute path and is strict", () => {
    expect(
      itemSchema.safeParse({ type: "TreeDoc", props: { path: "/a/tree.json" } })
        .success,
    ).toBe(true);
    expect(
      itemSchema.safeParse({ type: "TreeDoc", props: { path: "tree.json" } })
        .success,
    ).toBe(false);
    expect(itemSchema.safeParse({ type: "TreeDoc", props: {} }).success).toBe(
      false,
    );
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

  test("Diff requires a patch string and is strict", () => {
    expect(
      itemSchema.safeParse({ type: "Diff", props: { patch: "diff --git" } })
        .success,
    ).toBe(true);
    expect(itemSchema.safeParse({ type: "Diff", props: {} }).success).toBe(
      false,
    );
    expect(
      itemSchema.safeParse({
        type: "Diff",
        props: { patch: "x", diffStyle: "inline" },
      }).success,
    ).toBe(false);
  });

  test("Code requires a code string and is strict", () => {
    expect(
      itemSchema.safeParse({ type: "Code", props: { code: "const x = 1;" } })
        .success,
    ).toBe(true);
    expect(itemSchema.safeParse({ type: "Code", props: {} }).success).toBe(
      false,
    );
    expect(
      itemSchema.safeParse({ type: "Code", props: { code: "x", extra: 1 } })
        .success,
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
    expect(withChild("PlainText", { body: "x" })).toBe(false);
    expect(withChild("Diff", { patch: "diff" })).toBe(false);
    expect(withChild("Code", { code: "x" })).toBe(false);
    expect(withChild("Badge", { text: "x" })).toBe(false);
    expect(withChild("Mermaid", { code: "graph TD; A-->B" })).toBe(false);
    expect(withChild("TreeDoc", { path: "/a/tree.json" })).toBe(false);
  });

  test("Badge requires text, is strict, and constrains variant", () => {
    expect(
      itemSchema.safeParse({ type: "Badge", props: { text: "open" } }).success,
    ).toBe(true);
    expect(
      itemSchema.safeParse({
        type: "Badge",
        props: { text: "merged", variant: "secondary" },
      }).success,
    ).toBe(true);
    expect(itemSchema.safeParse({ type: "Badge", props: {} }).success).toBe(
      false,
    );
    expect(
      itemSchema.safeParse({
        type: "Badge",
        props: { text: "x", variant: "ghost" },
      }).success,
    ).toBe(false);
    expect(
      itemSchema.safeParse({ type: "Badge", props: { text: "x", extra: 1 } })
        .success,
    ).toBe(false);
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
