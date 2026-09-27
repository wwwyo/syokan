/**
 * Deep equality over JSON-shaped values. Used by the writeback correspondence
 * rules: a Checklist item's label is inline content (string or structured
 * array), so "same label" means a deep-equal label, not ===.
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length &&
      a.every((value, i) => jsonEqual(value, b[i]))
    );
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => jsonEqual(a[key], b[key]))
    );
  }
  return false;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
