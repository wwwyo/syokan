import { type ParseTreeFailure, parseTreeContent } from "../src/lib/treeSource";
import type { Item } from "../src/schema";
import { type ReadFileFailure, readTextFile } from "./fileSource";

export type MaterializeFailure = ReadFileFailure | ParseTreeFailure;

export type MaterializeResult =
  | { ok: true; root: Item }
  | { ok: false; path: string; reason: MaterializeFailure };

// key and the cross-cutting mechanisms (id / tags) ride along unchanged
function carryNodeFields(from: Item, to: Item): void {
  if (from.key !== undefined) to.key = from.key;
  if (from.id !== undefined) to.id = from.id;
  if (from.tags !== undefined) to.tags = from.tags;
}

// A published envelope leaves the localhost trust boundary: probe args/results can
// carry local paths, so hiding them in the shared *view* is not enough — strip them
// from the published data itself unless the producer opted in with shareVisible.
function redactProbe(props: Record<string, unknown>): Record<string, unknown> {
  if (props.shareVisible === true) return { ...props };
  return typeof props.label === "string" ? { label: props.label } : {};
}

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
    // the synced subtree can itself contain Probes; re-run the copy over it so
    // redaction applies (it can't contain TreeDoc — nesting is banned at parse)
    const inner = await materializeTree(parsed.root);
    if (!inner.ok) return inner;
    const node = inner.root;
    carryNodeFields(item, node);
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
  const copy: Item = {
    type: item.type,
    props: item.type === "Probe" ? redactProbe(item.props) : { ...item.props },
  };
  if (children) copy.children = children;
  carryNodeFields(item, copy);
  return { ok: true, root: copy };
}
