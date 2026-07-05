import { z } from "zod";
import { specs } from "./index";

export type CatalogEntry = {
  type: string;
  // props turned into JSON Schema. The LLM builds props using this as the SSOT.
  props: Record<string, unknown>;
  // null=no restriction on children (container), []=no children (leaf), [..]=limited to allowed types.
  childrenTypes: readonly string[] | null;
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
  }));
}
