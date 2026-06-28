import { describe, expect, test } from "bun:test";
import { components } from "./index";
import { catalogManifest } from "./manifest";

describe("catalogManifest", () => {
  test("covers every registered catalog type exactly once", () => {
    const types = catalogManifest()
      .map((e) => e.type)
      .sort();
    const expected = [...components.keys()].sort();
    expect(types).toEqual(expected);
  });

  test("emits JSON Schema for props (object with additionalProperties:false)", () => {
    const heading = catalogManifest().find((e) => e.type === "Heading");
    expect(heading).toBeDefined();
    const props = heading?.props as {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
    expect(props.type).toBe("object");
    expect(props.properties?.text).toBeDefined();
    expect(props.required).toContain("text");
    // strict() は additionalProperties:false になる (未定義 props を弾く契約)。
    expect(props.additionalProperties).toBe(false);
  });

  test("childrenTypes: container=null, leaf=[]", () => {
    const byType = new Map(catalogManifest().map((e) => [e.type, e]));
    expect(byType.get("Stack")?.childrenTypes).toBeNull();
    expect(byType.get("Card")?.childrenTypes).toBeNull();
    expect(byType.get("Heading")?.childrenTypes).toEqual([]);
    expect(byType.get("Text")?.childrenTypes).toEqual([]);
  });
});
