import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Graph, graphPropsSchema } from ".";
import { layoutGraph } from "./layout";

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

  test("accepts the changed role", () => {
    const result = graphPropsSchema.safeParse({
      nodes: [{ id: "a", role: "changed" }],
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

  test("accepts a node referencing a declared group", () => {
    const result = graphPropsSchema.safeParse({
      nodes: [{ id: "a", group: "g1" }],
      groups: [{ id: "g1", label: "module a" }],
    });
    expect(result.success).toBe(true);
  });

  test("rejects a node referencing an unknown group id", () => {
    const result = graphPropsSchema.safeParse({
      nodes: [{ id: "a", group: "ghost" }],
      groups: [{ id: "g1" }],
    });
    expect(result.success).toBe(false);
  });

  test("rejects duplicate group ids", () => {
    const result = graphPropsSchema.safeParse({
      nodes: [{ id: "a" }],
      groups: [{ id: "g1" }, { id: "g1" }],
    });
    expect(result.success).toBe(false);
  });

  test("rejects href not starting with #", () => {
    const result = graphPropsSchema.safeParse({
      nodes: [{ id: "a", href: "https://example.com" }],
    });
    expect(result.success).toBe(false);
  });

  test("accepts an in-view href", () => {
    const result = graphPropsSchema.safeParse({
      nodes: [{ id: "a", href: "#finding-1" }],
    });
    expect(result.success).toBe(true);
  });

  test("accepts edge labels", () => {
    const result = graphPropsSchema.safeParse({
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ from: "a", to: "b", label: "imports" }],
    });
    expect(result.success).toBe(true);
  });
});

describe("layoutGraph", () => {
  test("nodes inside a group get coordinates within the group's box", () => {
    const layout = layoutGraph({
      nodes: [
        { id: "a", group: "g1" },
        { id: "b", group: "g1" },
        { id: "c" },
      ],
      edges: [{ from: "a", to: "b" }],
      groups: [{ id: "g1", label: "module" }],
    });
    const group = layout.groups.find((g) => g.id === "g1");
    expect(group).toBeDefined();
    if (!group) throw new Error("unreachable");
    for (const id of ["a", "b"]) {
      const node = layout.nodes.find((n) => n.id === id);
      expect(node).toBeDefined();
      if (!node) throw new Error("unreachable");
      expect(node.x).toBeGreaterThanOrEqual(group.x);
      expect(node.y).toBeGreaterThanOrEqual(group.y);
      expect(node.x + node.width).toBeLessThanOrEqual(group.x + group.width);
      expect(node.y + node.height).toBeLessThanOrEqual(group.y + group.height);
    }
  });

  // nodes[].id and groups[].id are independent id spaces in the schema (nothing forbids a
  // node and a group sharing a string), but dagre's compound Graph keys both in one flat
  // namespace internally; a node whose id equals its own group's id must not collapse into
  // a self-parent cycle or corrupt the other node's position (regression: `groupKey`).
  test("a node id equal to its own group id does not collide", () => {
    const layout = layoutGraph({
      nodes: [
        { id: "skill", group: "skill" },
        { id: "other", group: "skill" },
      ],
      groups: [{ id: "skill", label: "skills/syokan" }],
    });
    const group = layout.groups.find((g) => g.id === "skill");
    expect(group).toBeDefined();
    if (!group) throw new Error("unreachable");
    expect(layout.nodes).toHaveLength(2);
    const [a, b] = layout.nodes;
    if (!a || !b) throw new Error("unreachable");
    // both nodes must be distinct, non-overlapping boxes inside the group
    expect(a.x !== b.x || a.y !== b.y).toBe(true);
  });

  test("LR spreads nodes mainly along x, TB mainly along y", () => {
    const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const edges = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ];
    const lr = layoutGraph({ nodes, edges, direction: "LR" });
    const tb = layoutGraph({ nodes, edges, direction: "TB" });
    const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
    const lrXSpread = spread(lr.nodes.map((n) => n.x));
    const lrYSpread = spread(lr.nodes.map((n) => n.y));
    const tbXSpread = spread(tb.nodes.map((n) => n.x));
    const tbYSpread = spread(tb.nodes.map((n) => n.y));
    expect(lrXSpread).toBeGreaterThan(lrYSpread);
    expect(tbYSpread).toBeGreaterThan(tbXSpread);
  });

  test("cycles do not throw", () => {
    expect(() =>
      layoutGraph({
        nodes: [{ id: "a" }, { id: "b" }],
        edges: [
          { from: "a", to: "b" },
          { from: "b", to: "a" },
        ],
      }),
    ).not.toThrow();
  });

  test("is deterministic for the same input", () => {
    const input = {
      nodes: [
        { id: "a", label: "alpha", group: "g1" },
        { id: "b", label: "beta", sub: "changed", group: "g1" },
        { id: "c", label: "gamma" },
      ],
      edges: [
        { from: "a", to: "b", role: "added" as const },
        { from: "b", to: "c", label: "imports" },
      ],
      groups: [{ id: "g1", label: "module a" }],
    };
    const first = layoutGraph(input);
    const second = layoutGraph(input);
    expect(second).toEqual(first);
  });
});

describe("Graph", () => {
  test("renders a full example (groups + sub + href + labels) and contains the caption", () => {
    const html = renderToString(
      createElement(Graph, {
        nodes: [
          { id: "skill", label: "SKILL.md", role: "changed" as const, sub: "risk-panel pointer", group: "skills" },
          { id: "panel", label: "risk-panel.md", role: "changed" as const, group: "skills" },
          { id: "routes", label: "routes.ts", role: "neutral" as const, group: "server" },
          {
            id: "graph",
            label: "Graph/index.tsx",
            role: "hotspot" as const,
            sub: "React Flow renderer",
            href: "#finding-1",
            group: "catalogs",
          },
        ],
        edges: [
          { from: "skill", to: "panel", label: "imports" },
          { from: "routes", to: "graph", role: "hotspot" as const },
        ],
        groups: [
          { id: "skills", label: "skills/syokan" },
          { id: "server", label: "apps/syokan/server" },
          { id: "catalogs", label: "apps/syokan/src/catalogs" },
        ],
        direction: "LR",
        caption: "changes concentrate in the Graph renderer",
      }),
    );
    expect(html).toContain("changes concentrate in the Graph renderer");
  });

  test("renders a minimal single-node graph without throwing", () => {
    expect(() =>
      renderToString(createElement(Graph, { nodes: [{ id: "only", label: "lonely node" }] })),
    ).not.toThrow();
  });

  // regression: a node's id equal to its own group's id used to collapse both React Flow
  // node-list entries into one, dropping the group box and corrupting sibling positions
  test("renders both nodes when a node id equals its group id", () => {
    const html = renderToString(
      createElement(Graph, {
        nodes: [
          { id: "skill", label: "SKILL.md", group: "skill" },
          { id: "other", label: "other.md", group: "skill" },
        ],
        groups: [{ id: "skill", label: "skills/syokan" }],
      }),
    );
    expect(html).toContain("SKILL.md");
    expect(html).toContain("other.md");
    expect(html).toContain("skills/syokan");
  });
});

describe("layoutGraph group separation", () => {
  const boxes = (
    items: readonly { x: number; y: number; width: number; height: number }[],
  ) => items.map((b) => ({ x1: b.x, y1: b.y, x2: b.x + b.width, y2: b.y + b.height }));
  const overlaps = (
    a: { x1: number; y1: number; x2: number; y2: number },
    b: { x1: number; y1: number; x2: number; y2: number },
  ) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

  test("adjacent groups whose members share a rank do not overlap (real overview shape)", () => {
    // reproduces a posted review overview: "riskpanel" (group skill) and "registry"
    // (group catalogs) land in the same rank, so their cluster borders sit side by side
    const layout = layoutGraph({
      direction: "LR",
      groups: [{ id: "skill" }, { id: "catalogs" }, { id: "lib" }],
      nodes: [
        { id: "skillmd", sub: "s", group: "skill" },
        { id: "riskpanel", sub: "s", group: "skill" },
        { id: "examples", sub: "s", group: "skill" },
        { id: "graph", sub: "s", group: "catalogs" },
        { id: "layout", sub: "s", group: "catalogs" },
        { id: "registry", sub: "s", group: "catalogs" },
        { id: "anchor", sub: "s", group: "lib" },
        { id: "xyflow", sub: "s" },
        { id: "dagre", sub: "s" },
      ],
      edges: [
        { from: "skillmd", to: "riskpanel" },
        { from: "examples", to: "riskpanel" },
        { from: "riskpanel", to: "graph" },
        { from: "graph", to: "layout" },
        { from: "graph", to: "anchor" },
        { from: "graph", to: "xyflow" },
        { from: "layout", to: "dagre" },
        { from: "registry", to: "graph" },
      ],
    });
    const groupBoxes = boxes(layout.groups);
    for (let i = 0; i < groupBoxes.length; i++) {
      for (let j = i + 1; j < groupBoxes.length; j++) {
        expect(overlaps(groupBoxes[i]!, groupBoxes[j]!)).toBe(false);
      }
    }
  });

  for (const direction of ["TB", "LR"] as const) {
    test(`groups sharing a rank do not overlap (${direction})`, () => {
      // two groups whose members land in the same rank, plus an ungrouped node beside them
      const layout = layoutGraph({
        direction,
        groups: [{ id: "g1", label: "one" }, { id: "g2", label: "two" }],
        nodes: [
          { id: "a", label: "a", sub: "s", group: "g1" },
          { id: "b", label: "b", sub: "s", group: "g1" },
          { id: "c", label: "c", sub: "s", group: "g2" },
          { id: "d", label: "d", sub: "s", group: "g2" },
          { id: "e", label: "e", sub: "s" },
        ],
        edges: [
          { from: "a", to: "b" },
          { from: "b", to: "c" },
          { from: "c", to: "d" },
          { from: "a", to: "e" },
          { from: "e", to: "d" },
        ],
      });
      const groupBoxes = boxes(layout.groups);
      expect(overlaps(groupBoxes[0]!, groupBoxes[1]!)).toBe(false);
      const ungrouped = boxes(layout.nodes.filter((n) => n.group === undefined));
      for (const gb of groupBoxes) {
        for (const nb of ungrouped) expect(overlaps(gb, nb)).toBe(false);
      }
    });
  }
});

