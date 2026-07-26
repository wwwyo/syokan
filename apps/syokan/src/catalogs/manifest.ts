import { z } from "zod";
import type { Item } from "../schema/catalog";
import { createSnapshotInputSchema } from "../schema/snapshot";
import { specs } from "./index";

export type CatalogEntry = {
  type: string;
  // props turned into JSON Schema. The LLM builds props using this as the SSOT.
  props: Record<string, unknown>;
  // null=no restriction on children (container), []=no children (leaf), [..]=limited to allowed types.
  childrenTypes: readonly string[] | null;
  // usage contract not expressible in the props schema (children pairing rules etc.)
  notes?: string;
};

// converts the catalog (src/catalogs) into a machine-readable definition. The SSOT is specs;
// this is derivation only. Transcribing into md drifts, so always pull from here via the API/CLI.
export function catalogManifest(): CatalogEntry[] {
  return [...specs.values()].map((spec) => ({
    type: spec.type,
    props: z.toJSONSchema(spec.propsSchema as z.ZodType) as Record<
      string,
      unknown
    >,
    childrenTypes: spec.childrenTypes ?? null,
    ...(spec.notes !== undefined ? { notes: spec.notes } : {}),
  }));
}

// The POST/PUT snapshot request-body shape, as JSON Schema. The SSOT is
// src/schema/snapshot.ts; this is derivation only, published so producers pull the
// envelope contract from the API instead of a hand-copied doc.
// Serializing the real item union under `root` would re-inline every type's props — the
// same content `items` already carries, doubling the payload the producer has to read.
// Stand in an opaque node so the envelope describes only envelope-level keys; the node
// contract (type/props/children plus the cross-cutting key/id) is stated here in prose
// because it is the one part of the shape `items` cannot express.
const rootPlaceholder = z
  .object({})
  .loose()
  .describe(
    'The view tree: a catalog node `{ type, props, children? }`. Types and their props are in `items`. Any node also accepts `key` (React list identity) and `id` — an in-view anchor (a Link with href "#<id>" scrolls to it, revealing it if inside a closed Collapsible or a checked-folded Checklist item) and the identity that lets Checklist / Collapsible / Probe keep their viewer-local state across reloads.',
  );

export function catalogEnvelopeSchema(): Record<string, unknown> {
  return z.toJSONSchema(
    createSnapshotInputSchema(rootPlaceholder as unknown as z.ZodType<Item>),
  ) as Record<string, unknown>;
}
