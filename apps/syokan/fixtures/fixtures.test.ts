// Fixtures are living proof that representative views (review-cockpit's risk panel
// etc.) can be composed from generic primitives alone — they must keep validating
// against the current catalog schema.

import { describe, expect, test } from "bun:test";
import { itemSchema } from "../src/catalogs";
import type { Item } from "../src/schema";
import reviewPanel from "./review-panel.json";

function collectTypes(item: Item, into: Set<string>): void {
  into.add(item.type);
  for (const child of item.children ?? []) collectTypes(child, into);
}

describe("review-panel fixture", () => {
  test("root validates against the catalog schema", () => {
    const result = itemSchema.safeParse(reviewPanel.root);
    if (!result.success) {
      throw new Error(result.error.message);
    }
    expect(result.success).toBe(true);
  });

  test("uses no review-specific component — only generic primitives", () => {
    const parsed = itemSchema.parse(reviewPanel.root);
    const types = new Set<string>();
    collectTypes(parsed, types);
    // the capabilities the PRD demanded, all as generic types
    for (const required of [
      "Table",
      "Stat",
      "Checklist",
      "Collapsible",
      "TagFilter",
      "Graph",
      "Probe",
    ]) {
      expect(types.has(required)).toBe(true);
    }
  });

  test("cockpit rows anchor to finding cards by node id", () => {
    const parsed = itemSchema.parse(reviewPanel.root);
    const ids = new Set<string>();
    const anchors = new Set<string>();
    const walk = (item: Item): void => {
      if (item.id !== undefined) ids.add(item.id);
      const href = (item.props as { href?: unknown }).href;
      if (typeof href === "string" && href.startsWith("#")) {
        anchors.add(href.slice(1));
      }
      const rows = (item.props as { rows?: unknown }).rows;
      if (Array.isArray(rows)) {
        for (const row of rows.flat()) {
          const cellHref = (row as { props?: { href?: unknown } }).props?.href;
          if (typeof cellHref === "string" && cellHref.startsWith("#")) {
            anchors.add(cellHref.slice(1));
          }
        }
      }
      for (const child of item.children ?? []) walk(child);
    };
    walk(parsed);
    expect(anchors.size).toBeGreaterThan(0);
    for (const anchor of anchors) {
      expect(ids.has(anchor)).toBe(true);
    }
  });
});
