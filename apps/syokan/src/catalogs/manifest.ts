import { z } from "zod";
import { specs } from "./index";
import { probeCheckSchema } from "./Probe/check";

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

// Cross-cutting mechanisms that apply to nodes regardless of type. Published together
// with the manifest so producers (skills) never hand-copy render capabilities into
// their own docs (they'd drift on every change here).
export function catalogMechanisms(): Record<string, unknown> {
  return {
    node: {
      description:
        "Every node accepts these fields alongside type/props/children/key.",
      fields: {
        id: {
          type: "string",
          description:
            'In-view anchor and UI-state identity. A Link with href "#<id>" scrolls to the node, temporarily highlighting it and revealing it if inside a closed Collapsible, a checked-folded Checklist item, or a TagFilter-hidden subtree (the filter selection itself is untouched). Interactive nodes (Checklist/Collapsible/TagFilter/Probe) persist their state across reloads only when they carry an id.',
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description:
            "Opt into narrowing by an ancestor TagFilter: while a selection is active, only nodes whose tags intersect it stay visible. Untagged nodes are never filtered out.",
        },
      },
    },
    uiState: {
      description:
        "Interaction state (checks, open/closed, filter selection, probe reruns) lives in the viewer's browser per device+view, separate from snapshot data; it is never written back to the envelope, and changed node content invalidates it. On public shares, viewers get their own local state.",
    },
    probe: {
      description:
        "Probe.check admits only these predefined read-only kinds — no arbitrary command execution. diff_clean results carry the repo HEAD as target ref and are marked stale when it moves.",
      kinds: z.toJSONSchema(probeCheckSchema),
    },
  };
}
