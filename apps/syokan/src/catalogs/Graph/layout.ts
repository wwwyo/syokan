// dagre-based layout for the catalog Graph. dagre (not the old hand-rolled longest-path
// layering) buys compound graphs (setParent → group/cluster boxes) and automatic cycle
// handling (it reverses back edges internally for ranking, then un-reverses — no manual
// DFS/back-edge bookkeeping needed here, unlike the predecessor implementation).
import dagre from "@dagrejs/dagre";

type LayoutRole = string;

type LayoutNodeInput = {
  id: string;
  label?: string;
  sub?: string;
  role?: LayoutRole;
  group?: string;
  href?: string;
};

type LayoutEdgeInput = {
  from: string;
  to: string;
  role?: LayoutRole;
  label?: string;
};

type LayoutGroupInput = { id: string; label?: string };

/**
 * Structural shape `layoutGraph` needs. `GraphProps` (the zod-inferred type in
 * `./index.tsx`) satisfies this without importing it — importing it here would create
 * the schema-eager-registry TDZ cycle documented in `.agents/skills/coding/references/pitfalls.md`.
 */
type LayoutProps = {
  nodes: LayoutNodeInput[];
  edges?: LayoutEdgeInput[];
  groups?: LayoutGroupInput[];
  direction?: "TB" | "LR";
};

type LaidOutNode = {
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

type LaidOutGroup = {
  id: string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type LaidOutEdge = {
  from: string;
  to: string;
  role: LayoutRole;
  label?: string;
};

type GraphLayout = {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  groups: LaidOutGroup[];
  width: number;
  height: number;
};

// Label renders at text-sm (14px) and sub at text-xs (12px); dimensions sized for the
// wider glyph so text-sm content still fits (was 40/56/6.5 for a 12px label).
const NODE_HEIGHT = 44;
const NODE_HEIGHT_WITH_SUB = 60;
const CHAR_WIDTH = 7.5;
const NODE_PADDING_X = 16;
const MIN_NODE_WIDTH = 96;

// Group padding (below) is added AFTER dagre's layout pass, so dagre itself must already
// leave room for it: separations are derived from the pads rather than hand-synced
// constants, so the two can never drift apart. Cluster borders are dummy nodes to dagre,
// spaced by edgesep (default 20), so EDGE_SEP is raised to match NODE_SEP too.
const GRAPH_MARGIN = 16;
// dagre sizes a cluster tightly around its children; pad further so a group's label
// (rendered top-left, outside the child boxes) and border never sit flush on a node.
const GROUP_PAD_X = 16;
const GROUP_PAD_TOP = 28;
const GROUP_PAD_BOTTOM = 16;
const BASE_SEP = 32;
const NODE_SEP = Math.max(BASE_SEP, 2 * GROUP_PAD_X, GROUP_PAD_TOP + GROUP_PAD_BOTTOM);
const EDGE_SEP = NODE_SEP;
const RANK_SEP = Math.max(64, 2 * GROUP_PAD_X, GROUP_PAD_TOP + GROUP_PAD_BOTTOM);

function nodeDimensions(label: string, sub?: string): { width: number; height: number } {
  const longest = Math.max(label.length, sub?.length ?? 0);
  const width = Math.max(MIN_NODE_WIDTH, Math.round(longest * CHAR_WIDTH) + NODE_PADDING_X * 2);
  return { width, height: sub !== undefined ? NODE_HEIGHT_WITH_SUB : NODE_HEIGHT };
}

/**
 * Lay out nodes (optionally grouped into dagre compound clusters) and edges.
 * Deterministic: same input always produces the same output, since dagre's ranking/
 * ordering passes are seeded only by input order, never by iteration over a Set/Map with
 * non-deterministic key order — inputs here are arrays, walked in order. A node id equal
 * to a group id is rejected by the schema (`index.tsx`), so group ids can key dagre's
 * compound Graph (which shares one flat id space between clusters and plain nodes)
 * directly, with no namespacing.
 */
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
    g.setNode(group.id, {});
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  // resolved once so both the dagre setup below and the laid-out-node mapping agree on
  // which nodes have a valid group, instead of checking groupIds.has(...) in two places
  const nodeGroup = new Map<string, string>();
  for (const node of nodes) {
    if (node.group !== undefined && groupIds.has(node.group)) {
      nodeGroup.set(node.id, node.group);
    }
  }

  for (const node of nodes) {
    const { width, height } = nodeDimensions(node.label ?? node.id, node.sub);
    g.setNode(node.id, { width, height });
    const group = nodeGroup.get(node.id);
    if (group !== undefined) {
      g.setParent(node.id, group);
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
      group: nodeGroup.get(node.id),
      x: (dn.x ?? 0) - width / 2,
      y: (dn.y ?? 0) - height / 2,
      width,
      height,
    };
  });

  const laidOutGroups: LaidOutGroup[] = groups.map((group) => {
    const dg = g.node(group.id);
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
