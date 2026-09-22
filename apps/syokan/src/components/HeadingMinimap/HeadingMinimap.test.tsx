import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  activeIndex,
  collectHeadingEntries,
  HeadingMinimap,
  sameHeadings,
} from ".";

// `bun:test` runs with no DOM at all (no `document`, no `MutationObserver`) — this repo has no
// jsdom/happy-dom dependency, and adding one is out of scope here. So the DOM-scanning effect in
// HeadingMinimap itself is untestable, the same limitation Mermaid's async render effect hits
// (see coding pitfalls #12): only the pure logic factored out of it is covered directly.
// `collectHeadingEntries` takes `Element[]`, but its body only calls `.tagName`, `.textContent`
// and `.getClientRects()` — plain objects shaped like that stand in for real elements.
function fakeHeading(
  tagName: string,
  text: string,
  visible = true,
): Element {
  return {
    tagName,
    textContent: text,
    getClientRects: () => (visible ? [{}] : []),
  } as unknown as Element;
}

describe("activeIndex", () => {
  test("picks the last heading whose top has reached the reference line", () => {
    // three headings at y=0, 100, 300; line sits just past the second
    expect(activeIndex([0, 100, 300], 150, false)).toBe(1);
  });

  test("stays on the first heading when none has reached the line yet", () => {
    expect(activeIndex([50, 150, 300], 10, false)).toBe(0);
  });

  test("picks the last heading once scrolled to the very bottom, regardless of tops", () => {
    // the trailing section's heading may never line up with `line` if the page runs out of
    // room to scroll further — atBottom is the escape hatch for that case
    expect(activeIndex([0, 100, 300], 10, true)).toBe(2);
  });

  test("has no active heading when there are none", () => {
    expect(activeIndex([], 100, false)).toBe(-1);
  });
});

describe("collectHeadingEntries", () => {
  test("maps tag name to level and trims text, in the given (document) order", () => {
    const entries = collectHeadingEntries([
      fakeHeading("H1", "  Title  "),
      fakeHeading("H2", "Section A"),
      fakeHeading("H3", "Subsection"),
    ]);
    expect(entries.map((e) => e.level)).toEqual([1, 2, 3]);
    expect(entries.map((e) => e.text)).toEqual([
      "Title",
      "Section A",
      "Subsection",
    ]);
  });

  test("drops a heading with no client rects (closed Collapsible, hidden ancestor)", () => {
    const entries = collectHeadingEntries([
      fakeHeading("H2", "Visible"),
      fakeHeading("H2", "Folded away", false),
    ]);
    expect(entries.map((e) => e.text)).toEqual(["Visible"]);
  });

  test("ignores elements that are not h1/h2/h3", () => {
    const entries = collectHeadingEntries([fakeHeading("DIV", "Not a heading")]);
    expect(entries).toEqual([]);
  });

  test("reflects a DOM update: re-running after a heading is added returns the new list", () => {
    // Stands in for the MutationObserver-driven rescan (untestable here — see file header):
    // the same pure scan called again after the DOM changed must reflect the new set.
    const before = collectHeadingEntries([fakeHeading("H2", "Only section")]);
    const after = collectHeadingEntries([
      fakeHeading("H2", "Only section"),
      fakeHeading("H2", "New section"),
    ]);
    expect(before.map((e) => e.text)).toEqual(["Only section"]);
    expect(after.map((e) => e.text)).toEqual(["Only section", "New section"]);
  });
});

describe("sameHeadings", () => {
  test("is true for the same elements, text and levels in the same order", () => {
    const a = fakeHeading("H2", "Section");
    const b = fakeHeading("H3", "Sub");
    expect(
      sameHeadings(collectHeadingEntries([a, b]), collectHeadingEntries([a, b])),
    ).toBe(true);
  });

  test("is false when the element identity changes, even with identical text/level", () => {
    // A childList mutation that recreates the heading node (rather than editing it in place)
    // must be treated as a real change: a stale `el` reference would scroll to a detached node.
    const a1 = fakeHeading("H2", "Section");
    const a2 = fakeHeading("H2", "Section");
    expect(
      sameHeadings(collectHeadingEntries([a1]), collectHeadingEntries([a2])),
    ).toBe(false);
  });

  test("is false on text change, level change, or a different length", () => {
    const el = fakeHeading("H2", "Section");
    const entries = collectHeadingEntries([el]);
    const [entry] = entries;
    if (!entry) throw new Error("expected one entry");
    expect(sameHeadings(entries, collectHeadingEntries([fakeHeading("H2", "Renamed")]))).toBe(
      false,
    );
    expect(sameHeadings(entries, [{ ...entry, level: 3 }])).toBe(false);
    expect(sameHeadings(entries, [])).toBe(false);
  });

  test("is true for two empty lists", () => {
    expect(sameHeadings([], [])).toBe(true);
  });
});

describe("HeadingMinimap", () => {
  test("renders nothing before the DOM-scanning effect has run (SSR / pre-mount)", () => {
    // renderToString never runs effects, so headings state stays at its initial empty
    // value — this only proves the "fewer than 2 headings -> render null" gate, not the
    // scan/highlight/expand behavior, which needs a real browser (see file header).
    const html = renderToString(createElement(HeadingMinimap));
    expect(html).toBe("");
  });
});
