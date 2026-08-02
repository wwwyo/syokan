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

  // A constraint enforced by superRefine / .refine never reaches the emitted JSON Schema,
  // so a producer reading only `syokan catalog` would discover it from a 400. Each one
  // must be restated in a prop `.describe()` or the type's notes.
  test("constraints invisible in JSON Schema are restated in notes/description", () => {
    const byType = new Map(catalogManifest().map((e) => [e.type, e]));
    // Table: rows longer than columns are rejected (superRefine)
    expect(byType.get("Table")?.notes).toContain("rejected at ingest");
    // Graph: node id uniqueness + edge endpoints resolving to a node (superRefine)
    expect(byType.get("Graph")?.notes).toContain("unique within the graph");
    expect(byType.get("Graph")?.notes).toContain("every edge from/to");
    // Markdown: the rejected block constructs (superRefine over the marked token tree)
    expect(byType.get("Markdown")?.notes).toContain("rejected");
    // TreeDoc: bare-tree requirement + the nested-TreeDoc ban (parseTreeContent)
    expect(byType.get("TreeDoc")?.notes).toContain("nesting is rejected");
  });

  test("Heading.href documents that it links the heading itself", () => {
    const props = catalogManifest().find((e) => e.type === "Heading")?.props as {
      properties?: { href?: { description?: string } };
    };
    // the affordance that keeps producers from degrading an article title to a bare Link
    expect(props.properties?.href?.description).toContain("heading semantics");
    expect(props.properties?.href?.description).toContain("http(s)");
  });

  test("httpUrl props state the http(s)-only restriction (a .refine, not a format)", () => {
    const link = catalogManifest().find((e) => e.type === "Link")?.props as {
      properties?: { href?: { anyOf?: { description?: string }[] } };
    };
    const descriptions = (link.properties?.href?.anyOf ?? []).map(
      (branch) => branch.description ?? "",
    );
    expect(descriptions.some((d) => d.includes("http(s)"))).toBe(true);
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

  test("envelope states the tree-wide id uniqueness rule (a custom ingest check)", () => {
    const root = (
      catalogEnvelopeSchema() as {
        properties?: { root?: { description?: string } };
      }
    ).properties?.root;
    expect(root?.description).toContain("unique across the whole tree");
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
