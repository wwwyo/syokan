import { type ParseTreeFailure, parseTreeContent } from "../src/lib/treeSource";
import type { Item } from "../src/schema";
import { type ReadFileFailure, readTextFile } from "./fileSource";

export type MaterializeFailure = ReadFileFailure | ParseTreeFailure;

export type MaterializeResult =
  | { ok: true; root: Item }
  | { ok: false; path: string; reason: MaterializeFailure };

/**
 * Copy the tree while freezing each TreeDoc into its referenced subtree at publish time.
 * Interpretation of the file content (parse / validation / the nested-TreeDoc ban) mirrors the
 * client render via parseTreeContent. A single failure fails the whole thing (don't produce an
 * incomplete publication). The original tree is not mutated.
 */
export async function materializeTree(item: Item): Promise<MaterializeResult> {
  if (item.type === "TreeDoc") {
    const path = typeof item.props.path === "string" ? item.props.path : "";
    const result = await readTextFile(path);
    if (!result.ok) return { ok: false, path, reason: result.reason };
    const parsed = parseTreeContent(result.content);
    if (!parsed.ok) return { ok: false, path, reason: parsed.reason };
    const node = parsed.root;
    if (item.key !== undefined) node.key = item.key;
    return { ok: true, root: node };
  }
  let children: Item[] | undefined;
  if (item.children) {
    const results = await Promise.all(item.children.map(materializeTree));
    children = [];
    for (const result of results) {
      if (!result.ok) return result;
      children.push(result.root);
    }
  }
  const copy: Item = { type: item.type, props: { ...item.props } };
  if (children) copy.children = children;
  if (item.key !== undefined) copy.key = item.key;
  return { ok: true, root: copy };
}
