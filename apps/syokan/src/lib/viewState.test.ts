import { describe, expect, test } from "bun:test";
import { hashContent } from "./viewState";

describe("hashContent", () => {
  test("is stable for equal content", () => {
    const a = { type: "Checklist", props: { items: [{ label: "x" }] } };
    const b = { type: "Checklist", props: { items: [{ label: "x" }] } };
    expect(hashContent(a)).toBe(hashContent(b));
  });

  test("changes when content changes (the UI-state invalidation key)", () => {
    const before = { type: "Checklist", props: { items: [{ label: "x" }] } };
    const after = { type: "Checklist", props: { items: [{ label: "y" }] } };
    // a live-sync that rewrites the node under the same id must not inherit old marks
    expect(hashContent(before)).not.toBe(hashContent(after));
  });
});
