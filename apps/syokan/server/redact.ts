import type { Item } from "../src/schema";

// key and the cross-cutting id mechanism ride along unchanged
function carryNodeFields(from: Item, to: Item): void {
  if (from.key !== undefined) to.key = from.key;
  if (from.id !== undefined) to.id = from.id;
}

// A published envelope leaves the localhost trust boundary: probe args/results can
// carry local paths, so hiding them in the shared *view* is not enough — strip them
// from the published data itself unless the producer opted in with shareVisible.
function redactProbe(props: Record<string, unknown>): Record<string, unknown> {
  if (props.shareVisible === true) return { ...props };
  return typeof props.label === "string" ? { label: props.label } : {};
}

/**
 * Copy the tree for publish, redacting every Probe's check/result unless shareVisible.
 * The original tree is not mutated.
 */
export function redactTree(item: Item): Item {
  let children: Item[] | undefined;
  if (item.children) {
    children = item.children.map(redactTree);
  }
  const copy: Item = {
    type: item.type,
    props: item.type === "Probe" ? redactProbe(item.props) : { ...item.props },
  };
  if (children) copy.children = children;
  carryNodeFields(item, copy);
  return copy;
}
