import { z } from "zod";
import { specs } from "./index";

export type CatalogEntry = {
  type: string;
  // props を JSON Schema 化したもの。LLM はこれを SSOT として props を組む。
  props: Record<string, unknown>;
  // null=子の制限なし (container)、[]=子不可 (leaf)、[..]=許可 type 限定。
  childrenTypes: readonly string[] | null;
};

// catalog (src/catalogs) を machine-readable な定義に変換する。SSOT は specs で、
// ここは導出のみ。md に転記すると drift するため API/CLI 経由で常にここから引く。
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
