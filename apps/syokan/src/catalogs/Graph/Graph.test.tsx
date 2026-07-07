import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Graph, graphPropsSchema } from ".";
import { layoutGraph, NODE_HEIGHT } from "./layout";

describe("graphPropsSchema", () => {
  test("accepts nodes with roles and edges", () => {
    const result = graphPropsSchema.safeParse({
      nodes: [
        { id: "a", label: "A", role: "added" },
        { id: "b", role: "hotspot" },
      ],
      edges: [{ from: "a", to: "b", role: "removed" }],
      caption: "before",
    });
    expect(result.success).toBe(true);
  });

  test("rejects edges referencing unknown node ids", () => {
    const result = graphPropsSchema.safeParse({
      nodes: [{ id: "a" }],
      edges: [{ from: "a", to: "ghost" }],
    });
    expect(result.success).toBe(false);
  });

  test("rejects duplicate node ids and unknown roles", () => {
    expect(
      graphPropsSchema.safeParse({ nodes: [{ id: "a" }, { id: "a" }] }).success,
    ).toBe(false);
    expect(
      graphPropsSchema.safeParse({ nodes: [{ id: "a", role: "warning" }] })
        .success,
    ).toBe(false);
  });
});

describe("layoutGraph", () => {
  test("layers follow the longest path left to right", () => {
    const layout = layoutGraph(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "a", to: "c" },
      ],
    );
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    const a = byId.get("a");
    const b = byId.get("b");
    const c = byId.get("c");
    expect(a && b && a.x < b.x).toBe(true);
    expect(b && c && b.x < c.x).toBe(true);
  });

  test("cycles do not hang or stack nodes on one layer", () => {
    const layout = layoutGraph(
      [{ id: "a" }, { id: "b" }],
      [
        { from: "a", to: "b" },
        { from: "b", to: "a" },
      ],
    );
    const xs = new Set(layout.nodes.map((n) => n.x));
    expect(xs.size).toBe(2);
    expect(layout.edges.length).toBe(2);
  });

  test("single node layout has sane dimensions", () => {
    const layout = layoutGraph([{ id: "only" }], []);
    expect(layout.height).toBe(NODE_HEIGHT);
    expect(layout.width).toBeGreaterThan(0);
  });
});

describe("Graph", () => {
  test("renders labels and role-styled boxes", () => {
    const html = renderToString(
      createElement(Graph, {
        nodes: [
          { id: "a", label: "frontend" },
          { id: "b", label: "proxy", role: "added" as const },
        ],
        edges: [{ from: "a", to: "b", role: "added" as const }],
        caption: "after",
      }),
    );
    expect(html).toContain("frontend");
    expect(html).toContain("proxy");
    expect(html).toContain('data-role="added"');
    expect(html).toContain("after");
    expect(html).toContain("stroke-emerald-600");
  });

  test("removed role renders dashed", () => {
    const html = renderToString(
      createElement(Graph, {
        nodes: [{ id: "x", label: "gone", role: "removed" as const }],
      }),
    );
    expect(html).toContain("stroke-dasharray");
  });
});
