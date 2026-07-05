// Turn the content of a TreeDoc-referenced file into a validated catalog tree. Both the client
// render (TreeDoc) and publish-time freezing (server materialize) draw on this single rule to
// prevent interpretation drift.

import { itemSchema } from "../catalogs";
import type { Item } from "../schema";

export type ParseTreeFailure = "invalid_json" | "invalid_tree" | "nested_treedoc";

export type ParseTreeResult =
  | { ok: true; root: Item }
  | { ok: false; reason: ParseTreeFailure };

function containsTreeDoc(item: Item): boolean {
  if (item.type === "TreeDoc") return true;
  return item.children?.some(containsTreeDoc) ?? false;
}

/**
 * Parse file content as a catalog tree. Nested TreeDoc (including self reference) is rejected
 * outright — banning nesting removes cycles and unbounded expansion by construction.
 */
export function parseTreeContent(content: string): ParseTreeResult {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  const parsed = itemSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "invalid_tree" };
  if (containsTreeDoc(parsed.data)) {
    return { ok: false, reason: "nested_treedoc" };
  }
  return { ok: true, root: parsed.data };
}
