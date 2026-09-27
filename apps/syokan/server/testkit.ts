import type { Item } from "../src/schema";

// Shared writeback fixture for store.test.ts / routes.test.ts: a Stack holding a
// Checklist carrying id "todo" with two unchecked items.
export const checklistTree: Item = {
  type: "Stack",
  props: {},
  children: [
    {
      type: "Checklist",
      id: "todo",
      props: { items: [{ label: "a" }, { label: "b" }] },
    },
  ],
};

// A conditional set landing on the `occurrence`th same-label item's `checked`.
// `expectProps` carries the node's props as the view rendered them — the whole
// items array (compare-and-set), so any drift including a same-label insertion
// is refused before a wrong item can be rewritten.
export function checkWriteback(
  label: string,
  occurrence = 1,
  expectProps: Record<string, unknown> = {
    items: [{ label: "a" }, { label: "b" }],
  },
) {
  return {
    item: { label, occurrence },
    set: { checked: true },
    expect: expectProps,
  };
}
