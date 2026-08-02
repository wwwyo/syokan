import { describe, expect, test } from "bun:test";
import { parseTreeContent } from "../lib/treeSource";
import { graphPropsSchema } from "./Graph";
import { components } from "./index";
import { markdownPropsSchema } from "./Markdown";
import { catalogEnvelopeSchema, catalogManifest } from "./manifest";
import { tablePropsSchema } from "./Table";

/** Every `format: "uri"` subschema anywhere in an emitted props schema (httpUrl's footprint). */
function collectUriSchemas(node: unknown): { description?: string }[] {
  if (node === null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(collectUriSchemas);
  const record = node as Record<string, unknown>;
  const self = record.format === "uri" ? [record as { description?: string }] : [];
  return [...self, ...Object.values(record).flatMap(collectUriSchemas)];
}

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
  // must be restated in a prop `.describe()` or the type's notes. Each case asserts the
  // constraint *and* its wording together: asserting the wording alone would stay green
  // while a dropped refine turned the published note into a lie.
  test("constraints invisible in JSON Schema are restated in notes/description", () => {
    const byType = new Map(catalogManifest().map((e) => [e.type, e]));

    // Table: rows longer than columns are rejected (superRefine)
    expect(
      tablePropsSchema.safeParse({ columns: ["A"], rows: [["a", "b"]] }).success,
    ).toBe(false);
    expect(byType.get("Table")?.notes).toContain("rejected at ingest");

    // Graph: node id uniqueness + edge endpoints resolving to a node (superRefine)
    expect(
      graphPropsSchema.safeParse({ nodes: [{ id: "a" }, { id: "a" }] }).success,
    ).toBe(false);
    expect(
      graphPropsSchema.safeParse({
        nodes: [{ id: "a" }],
        edges: [{ from: "a", to: "missing" }],
      }).success,
    ).toBe(false);
    expect(byType.get("Graph")?.notes).toContain("unique within the graph");
    expect(byType.get("Graph")?.notes).toContain("every edge from/to");

    // Markdown: the rejected block constructs (superRefine over the marked token tree)
    expect(markdownPropsSchema.safeParse({ body: "# heading" }).success).toBe(
      false,
    );
    expect(markdownPropsSchema.safeParse({ body: "<b>raw</b>" }).success).toBe(
      false,
    );
    expect(byType.get("Markdown")?.notes).toContain("raw HTML");
    expect(byType.get("Markdown")?.notes).toContain("are rejected");

    // TreeDoc: bare-tree requirement + the nested-TreeDoc ban (parseTreeContent)
    expect(
      parseTreeContent(JSON.stringify({ root: { type: "Text", props: {} } })).ok,
    ).toBe(false);
    expect(
      parseTreeContent(
        JSON.stringify({
          type: "Stack",
          props: {},
          children: [{ type: "TreeDoc", props: { path: "/tmp/x.json" } }],
        }),
      ).ok,
    ).toBe(false);
    expect(byType.get("TreeDoc")?.notes).toContain("nesting is rejected");
    expect(byType.get("TreeDoc")?.notes).toContain("not a snapshot envelope");
  });

  test("Heading.href documents that it links the heading itself", () => {
    const props = catalogManifest().find((e) => e.type === "Heading")?.props as {
      properties?: { href?: { description?: string } };
    };
    // the affordance that keeps producers from degrading an article title to a bare Link
    expect(props.properties?.href?.description).toContain("heading semantics");
  });

  // Swept over every uri-formatted prop rather than a sampled one: a prop that adds its own
  // `.describe()` on httpUrl replaces the shared description, silently dropping the clause.
  test("every httpUrl prop states the http(s)-only restriction (a .refine, not a format)", () => {
    const uriSchemas = catalogManifest().flatMap((entry) =>
      collectUriSchemas(entry.props).map(
        (schema) => [entry.type, schema] as const,
      ),
    );
    // guards the sweep itself: an empty match set would make every assertion below vacuous
    expect(uriSchemas.length).toBeGreaterThanOrEqual(2);
    for (const [type, schema] of uriSchemas) {
      expect(`${type}: ${schema.description ?? ""}`).toContain("http(s)");
      expect(`${type}: ${schema.description ?? ""}`).toContain(
        "rejected at ingest",
      );
    }
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
