import { findItem, type Item } from "../src/schema";

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
  const copy = structuredClone(item);
  findItem(copy, (node) => {
    if (node.type === "Probe") node.props = redactProbe(node.props);
    return false; // visit every node
  });
  return copy;
}
