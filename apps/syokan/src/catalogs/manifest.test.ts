import { describe, expect, test } from "bun:test";
import { components } from "./index";
import { catalogEnvelopeSchema, catalogManifest } from "./manifest";

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

describe("catalogEnvelopeSchema", () => {
  test("emits JSON Schema for the snapshot input (POST/PUT body)", () => {
    const schema = catalogEnvelopeSchema() as {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
    expect(schema.type).toBe("object");
    expect(schema.properties?.root).toBeDefined();
    expect(schema.properties?.idempotencyKey).toBeDefined();
    expect(schema.required).toContain("root");
    expect(schema.required).not.toContain("idempotencyKey");
    // strict() becomes additionalProperties:false (no silent-strip contract).
    expect(schema.additionalProperties).toBe(false);
  });

  test("envelope keeps root opaque instead of inlining the item union", () => {
    // Serializing the real item schema under root would re-emit every type's props as
    // $defs — the content `items` already carries — roughly doubling what a producer
    // must read. Lock the payload down so that regression is loud.
    const serialized = JSON.stringify(catalogEnvelopeSchema());
    expect(serialized).not.toContain("$defs");
    expect(serialized).not.toContain("$ref");
    expect(serialized.length).toBeLessThan(2_000);
  });
});
