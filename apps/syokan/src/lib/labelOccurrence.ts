import { isRecord, jsonEqual } from "./json";

/**
 * The label correspondence for writeback targeting (docs/prd/node-identity): an
 * item of a node's `items` array is identified by its label — inline content,
 * so "same label" means deep-equal — disambiguated by its 1-based occurrence
 * among same-label items. Never by index: an LLM's insert/delete/reorder
 * silently shifts an index onto a different item, while a broken label
 * correspondence is refusable.
 *
 * Both directions live here so the view computing `occurrence` for a clicked
 * item and the store resolving `occurrence` back to an index share one rule —
 * if they diverged, every writeback would be refused.
 */

/**
 * The 1-based occurrence of `items[index]` among same-label items — the
 * `occurrence` a view sends for a clicked item. 0 when the element is not a
 * record (views post schema-shaped items, so this only guards stored trees).
 */
export function labelOccurrenceAt(
  items: readonly unknown[],
  index: number,
): number {
  const element = items[index];
  if (!isRecord(element)) return 0;
  let seen = 0;
  for (let i = 0; i <= index; i++) {
    const other = items[i];
    if (isRecord(other) && jsonEqual(other.label, element.label)) seen++;
  }
  return seen;
}

/**
 * The index of the `occurrence`th (1-based) element whose `label` deep-equals —
 * the store's side of the correspondence — or -1 when fewer than `occurrence`
 * elements carry that label.
 */
export function indexOfLabelOccurrence(
  items: readonly unknown[],
  label: unknown,
  occurrence: number,
): number {
  let seen = 0;
  for (let i = 0; i < items.length; i++) {
    const element = items[i];
    if (isRecord(element) && jsonEqual(element.label, label)) {
      seen++;
      if (seen === occurrence) return i;
    }
  }
  return -1;
}
