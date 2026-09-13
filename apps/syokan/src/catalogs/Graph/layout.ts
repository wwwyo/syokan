// dagre-based layout for the catalog Graph. dagre (not the old hand-rolled longest-path
// layering) buys compound graphs (setParent → group/cluster boxes) and automatic cycle
// handling (it reverses back edges internally for ranking, then un-reverses — no manual
// DFS/back-edge bookkeeping needed here, unlike the predecessor implementation).
import dagre from "@dagrejs/dagre";

export type LayoutRole = string;

export type LayoutNodeInput = {
  id: string;
  label?: string;
  sub?: string;
  role?: LayoutRole;
  group?: string;
  href?: string;
};

export type LayoutEdgeInput = {
  from: string;
  to: string;
  role?: LayoutRole;
  label?: string;
};

export type LayoutGroupInput = { id: string; label?: string };

/**
 * Structural shape `layoutGraph` needs. `GraphProps` (the zod-inferred type in
 * `./index.tsx`) satisfies this without importing it — importing it here would create
 * the schema-eager-registry TDZ cycle documented in `.agents/skills/coding/references/pitfalls.md`.
 */
export type LayoutProps = {
  nodes: LayoutNodeInput[];
  edges?: LayoutEdgeInput[];
  groups?: LayoutGroupInput[];
  direction?: "TB" | "LR";
};

export type LaidOutNode = {
  id: string;
  label: string;
  sub?: string;
  role: LayoutRole;
  href?: string;
  group?: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LaidOutGroup = {
  id: string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LaidOutEdge = {
  from: string;
  to: string;
  role: LayoutRole;
  label?: string;
};

export type GraphLayout = {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  groups: LaidOutGroup[];
  width: number;
  height: number;
};

const NODE_HEIGHT = 40;
const NODE_HEIGHT_WITH_SUB = 56;
const CHAR_WIDTH = 6.5;
const NODE_PADDING_X = 16;
const MIN_NODE_WIDTH = 96;

// The group padding below is added after layout, so dagre's separations must exceed the
// pads they can absorb (cross axis: TOP + BOTTOM in LR, 2 * X in TB) or two groups sharing
// a rank overlap. Cluster borders are dummy nodes to dagre, spaced by EDGE_SEP (default 20)
// rather than NODE_SEP, so it is raised to the same value.
const NODE_SEP = 48;
const EDGE_SEP = 48;
const RANK_SEP = 64;
const GRAPH_MARGIN = 16;
// dagre sizes a cluster tightly around its children; pad further so a group's label
// (rendered top-left, outside the child boxes) and border never sit flush on a node.
const GROUP_PAD_X = 16;
const GROUP_PAD_TOP = 28;
const GROUP_PAD_BOTTOM = 16;

function nodeDimensions(label: string, sub?: string): { width: number; height: number } {
  const longest = Math.max(label.length, sub?.length ?? 0);
  const width = Math.max(MIN_NODE_WIDTH, Math.round(longest * CHAR_WIDTH) + NODE_PADDING_X * 2);
  return { width, height: sub !== undefined ? NODE_HEIGHT_WITH_SUB : NODE_HEIGHT };
}

/**
 * Lay out nodes (optionally grouped into dagre compound clusters) and edges.
 * Deterministic: same input always produces the same output, since dagre's ranking/
 * ordering passes are seeded only by input order, never by iteration over a Set/Map with
 * non-deterministic key order — inputs here are arrays, walked in order.
 */
// dagre's compound Graph keys clusters and plain nodes in the same namespace (setNode /
// setParent take one flat string id space), so a node and a group sharing an id — nodes[]
// and groups[] are independent id spaces in the public schema, nothing forbids overlap —
// would collide into the same graph node and dagre reports a false self-parent cycle. A
// control-character prefix, which no realistic posted id contains, keeps the two spaces apart.
const GROUP_KEY_PREFIX = "\u0000group:";
/**
 * Exported so `index.tsx` can namespace React Flow node ids the same way: nodes[].id and
 * groups[].id are independent id spaces in the public schema (nothing forbids a node and a
 * group sharing a string), but both dagre's compound Graph and React Flow's node list key
 * everything by one flat `id` -- without this, a colliding pair silently overwrites one
 * entry with the other.
 */
export function groupKey(id: string): string {
  return `${GROUP_KEY_PREFIX}${id}`;
}

export function layoutGraph(props: LayoutProps): GraphLayout {
  const { nodes, edges = [], groups = [], direction = "TB" } = props;

  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({
    rankdir: direction,
    nodesep: NODE_SEP,
    edgesep: EDGE_SEP,
    ranksep: RANK_SEP,
    marginx: GRAPH_MARGIN,
    marginy: GRAPH_MARGIN,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const groupIds = new Set(groups.map((group) => group.id));
  for (const group of groups) {
    g.setNode(groupKey(group.id), {});
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  for (const node of nodes) {
    const { width, height } = nodeDimensions(node.label ?? node.id, node.sub);
    g.setNode(node.id, { width, height });
    if (node.group !== undefined && groupIds.has(node.group)) {
      g.setParent(node.id, groupKey(node.group));
    }
  }

  // schema validation guarantees refs, but Storybook/direct use may not go through it;
  // dropping unknown ids keeps dagre from throwing on a dangling edge endpoint
  const validEdges = edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
  for (const e of validEdges) {
    g.setEdge(e.from, e.to);
  }

  dagre.layout(g);

  const laidOutNodes: LaidOutNode[] = nodes.map((node) => {
    const dn = g.node(node.id);
    const width = dn.width ?? MIN_NODE_WIDTH;
    const height = dn.height ?? NODE_HEIGHT;
    return {
      id: node.id,
      label: node.label ?? node.id,
      sub: node.sub,
      role: node.role ?? "neutral",
      href: node.href,
      group: node.group !== undefined && groupIds.has(node.group) ? node.group : undefined,
      x: (dn.x ?? 0) - width / 2,
      y: (dn.y ?? 0) - height / 2,
      width,
      height,
    };
  });

  const laidOutGroups: LaidOutGroup[] = groups.map((group) => {
    const dg = g.node(groupKey(group.id));
    const width = (dg.width ?? 0) + GROUP_PAD_X * 2;
    const height = (dg.height ?? 0) + GROUP_PAD_TOP + GROUP_PAD_BOTTOM;
    return {
      id: group.id,
      label: group.label,
      x: (dg.x ?? 0) - (dg.width ?? 0) / 2 - GROUP_PAD_X,
      y: (dg.y ?? 0) - (dg.height ?? 0) / 2 - GROUP_PAD_TOP,
      width,
      height,
    };
  });

  const laidOutEdges: LaidOutEdge[] = validEdges.map((e) => ({
    from: e.from,
    to: e.to,
    role: e.role ?? "neutral",
    label: e.label,
  }));

  const boxes = [
    ...laidOutNodes.map((n) => ({ x: n.x, y: n.y, x2: n.x + n.width, y2: n.y + n.height })),
    ...laidOutGroups.map((gr) => ({ x: gr.x, y: gr.y, x2: gr.x + gr.width, y2: gr.y + gr.height })),
  ];
  const minX = boxes.length > 0 ? Math.min(...boxes.map((b) => b.x)) : 0;
  const minY = boxes.length > 0 ? Math.min(...boxes.map((b) => b.y)) : 0;
  const maxX = boxes.length > 0 ? Math.max(...boxes.map((b) => b.x2)) : 0;
  const maxY = boxes.length > 0 ? Math.max(...boxes.map((b) => b.y2)) : 0;

  for (const n of laidOutNodes) {
    n.x -= minX;
    n.y -= minY;
  }
  for (const gr of laidOutGroups) {
    gr.x -= minX;
    gr.y -= minY;
  }

  return {
    nodes: laidOutNodes,
    edges: laidOutEdges,
    groups: laidOutGroups,
    width: maxX - minX,
    height: maxY - minY,
  };
}
