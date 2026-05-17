import { describe, expect, test } from "bun:test";
import {
  type ItemComponent,
  PageSpec,
  SectionSpec,
  components,
  itemSchema,
} from "./catalog";
import { Page } from "./components/Page";
import { Section } from "./components/Section";

describe("catalog", () => {
  test("exposes Page and Section component specs", () => {
    expect(PageSpec.type).toBe("Page");
    expect(SectionSpec.type).toBe("Section");
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
    expect(components.get("Page")).toBe(Page as unknown as ItemComponent);
    expect(components.get("Section")).toBe(Section as unknown as ItemComponent);
    expect(components.get("Missing")).toBeUndefined();
    expect(components.size).toBe(2);
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
});
