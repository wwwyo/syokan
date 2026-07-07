// Deterministic layered layout for small directed graphs. Chosen over mermaid for the
// catalog Graph: generated mermaid syntax fails render on LLM slips, and semantic
// styling (role → color/stroke) must be fixed by the renderer, not re-invented per view.

export type GraphNodeInput = { id: string; label?: string };
export type GraphEdgeInput = { from: string; to: string };

export type LaidOutNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LaidOutEdge = {
  from: string;
  to: string;
  // cubic bezier control points, source → target
  path: { x1: number; y1: number; c1x: number; c1y: number; c2x: number; c2y: number; x2: number; y2: number };
};

export type GraphLayout = {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  width: number;
  height: number;
};

export const NODE_HEIGHT = 32;
const CHAR_WIDTH = 7.5;
const NODE_PADDING_X = 12;
const MIN_NODE_WIDTH = 56;
const LAYER_GAP = 64;
const ROW_GAP = 20;

function nodeWidth(label: string): number {
  return Math.max(MIN_NODE_WIDTH, Math.round(label.length * CHAR_WIDTH) + NODE_PADDING_X * 2);
}

// longest-path layering over the DAG part; back edges found by DFS are ignored for
// layering (they still render), so cycles degrade gracefully instead of failing.
function assignLayers(
  nodes: readonly GraphNodeInput[],
  edges: readonly GraphEdgeInput[],
): Map<string, number> {
  const forward: GraphEdgeInput[] = [];
  const state = new Map<string, "visiting" | "done">();
  const out = new Map<string, string[]>();
  for (const e of edges) {
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from)?.push(e.to);
  }
  const known = new Set(nodes.map((n) => n.id));
  const visit = (id: string, path: Set<string>) => {
    if (state.get(id) === "done") return;
    state.set(id, "visiting");
    path.add(id);
    for (const to of out.get(id) ?? []) {
      if (!known.has(to)) continue;
      if (path.has(to)) continue; // back edge: skip for layering
      forward.push({ from: id, to });
      visit(to, path);
    }
    path.delete(id);
    state.set(id, "done");
  };
  for (const n of nodes) visit(n.id, new Set());

  const layer = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  // relaxation over forward edges; |V| passes suffice for a DAG
  for (let i = 0; i < nodes.length; i++) {
    let changed = false;
    for (const e of forward) {
      const next = (layer.get(e.from) ?? 0) + 1;
      if (next > (layer.get(e.to) ?? 0)) {
        layer.set(e.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return layer;
}

/** Lay the graph out left-to-right. Node order within a layer follows input order. */
export function layoutGraph(
  nodes: readonly GraphNodeInput[],
  edges: readonly GraphEdgeInput[],
): GraphLayout {
  const layerOf = assignLayers(nodes, edges);
  const layers: GraphNodeInput[][] = [];
  for (const node of nodes) {
    const l = layerOf.get(node.id) ?? 0;
    layers[l] = layers[l] ?? [];
    layers[l].push(node);
  }

  const laidOut = new Map<string, LaidOutNode>();
  let x = 0;
  let totalHeight = 0;
  const layerWidths: number[] = [];
  for (const layer of layers) {
    if (!layer) continue;
    const widths = layer.map((n) => nodeWidth(n.label ?? n.id));
    layerWidths.push(Math.max(...widths));
    totalHeight = Math.max(
      totalHeight,
      layer.length * NODE_HEIGHT + (layer.length - 1) * ROW_GAP,
    );
  }
  let layerIndex = 0;
  for (const layer of layers) {
    if (!layer) continue;
    const width = layerWidths[layerIndex] ?? MIN_NODE_WIDTH;
    const layerHeight =
      layer.length * NODE_HEIGHT + (layer.length - 1) * ROW_GAP;
    let y = (totalHeight - layerHeight) / 2;
    for (const node of layer) {
      const label = node.label ?? node.id;
      laidOut.set(node.id, {
        id: node.id,
        label,
        x,
        y,
        width,
        height: NODE_HEIGHT,
      });
      y += NODE_HEIGHT + ROW_GAP;
    }
    x += width + LAYER_GAP;
    layerIndex++;
  }

  const laidOutEdges: LaidOutEdge[] = [];
  for (const e of edges) {
    const from = laidOut.get(e.from);
    const to = laidOut.get(e.to);
    if (!from || !to) continue;
    const x1 = from.x + from.width;
    const y1 = from.y + from.height / 2;
    const x2 = to.x;
    const y2 = to.y + to.height / 2;
    const bend = Math.max(24, (x2 - x1) / 2);
    laidOutEdges.push({
      from: e.from,
      to: e.to,
      path: { x1, y1, c1x: x1 + bend, c1y: y1, c2x: x2 - bend, c2y: y2, x2, y2 },
    });
  }

  return {
    nodes: [...laidOut.values()],
    edges: laidOutEdges,
    width: x - LAYER_GAP,
    height: totalHeight,
  };
}
