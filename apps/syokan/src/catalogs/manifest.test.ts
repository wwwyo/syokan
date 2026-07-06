import { describe, expect, test } from "bun:test";
import { components } from "./index";
import { catalogManifest, catalogMechanisms } from "./manifest";

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
    // strict() becomes additionalProperties:false (the contract that rejects undefined props).
    expect(props.additionalProperties).toBe(false);
  });

  test("childrenTypes: container=null, leaf=[]", () => {
    const byType = new Map(catalogManifest().map((e) => [e.type, e]));
    expect(byType.get("Stack")?.childrenTypes).toBeNull();
    expect(byType.get("Card")?.childrenTypes).toBeNull();
    expect(byType.get("Heading")?.childrenTypes).toEqual([]);
    expect(byType.get("Text")?.childrenTypes).toEqual([]);
  });

  test("interactive types publish usage notes", () => {
    const byType = new Map(catalogManifest().map((e) => [e.type, e]));
    expect(byType.get("Checklist")?.notes).toContain("children[i]");
    expect(byType.get("Probe")?.notes).toContain("read-only");
    // plain display types don't need notes
    expect(byType.get("Text")?.notes).toBeUndefined();
  });
});

describe("catalogMechanisms", () => {
  test("publishes the cross-cutting node fields machine-readably", () => {
    const mechanisms = catalogMechanisms() as {
      node?: { fields?: Record<string, unknown> };
      probe?: { kinds?: Record<string, unknown> };
    };
    expect(mechanisms.node?.fields?.id).toBeDefined();
    expect(mechanisms.node?.fields?.tags).toBeDefined();
  });

  test("publishes probe kinds as JSON Schema including all three kinds", () => {
    const json = JSON.stringify(catalogMechanisms());
    expect(json).toContain("diff_clean");
    expect(json).toContain("search_count");
    expect(json).toContain("file_exists");
  });
});
