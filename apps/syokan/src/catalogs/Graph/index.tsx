import {
  BaseEdge,
  Controls,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  type NodeTypes,
  Position,
  ReactFlow,
  getSmoothStepPath,
} from "@xyflow/react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { z } from "zod";
import { jumpToNode } from "../../lib/anchor";
import { t } from "../../lib/i18n";
import { useColorScheme } from "../../lib/useColorScheme";
import { cn } from "../../lib/utils";
import { layoutGraph } from "./layout";

// role = semantic classification; color and stroke are fixed here so the reading of a
// diagram never varies from generation to generation (the mermaid instability problem).
const roleSchema = z.enum(["added", "removed", "hotspot", "neutral", "changed"]);

export type GraphRole = z.infer<typeof roleSchema>;

const anchorHref = z
  .string()
  .regex(/^#.+/, "href must be an in-view anchor \"#<node id>\" (no URLs)");

export const graphPropsSchema = z
  .object({
    nodes: z
      .array(
        z
          .object({
            id: z.string().min(1),
            label: z.string().min(1).optional(),
            role: roleSchema.optional(),
            // one-line subtitle, e.g. "what changed" for this module/file
            sub: z.string().min(1).optional(),
            // must name one of groups[].id — enforced below, not by this field alone
            group: z.string().min(1).optional(),
            // in-view jump to a finding node ("#<node id>"); never a URL
            href: anchorHref.optional(),
          })
          .strict(),
      )
      .min(1),
    edges: z
      .array(
        z
          .object({
            from: z.string().min(1),
            to: z.string().min(1),
            role: roleSchema.optional(),
            label: z.string().min(1).optional(),
          })
          .strict(),
      )
      .optional(),
    // module/file group boundaries drawn as dashed boxes; referenced by nodes[].group
    groups: z
      .array(
        z
          .object({
            id: z.string().min(1),
            label: z.string().min(1).optional(),
          })
          .strict(),
      )
      .optional(),
    // layout axis; defaults to top-to-bottom when omitted
    direction: z.enum(["TB", "LR"]).optional(),
    caption: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set(value.nodes.map((n) => n.id));
    if (ids.size !== value.nodes.length) {
      ctx.addIssue({ code: "custom", path: ["nodes"], message: "node ids must be unique" });
    }
    const groupIds = new Set((value.groups ?? []).map((g) => g.id));
    if (value.groups !== undefined && groupIds.size !== value.groups.length) {
      ctx.addIssue({ code: "custom", path: ["groups"], message: "group ids must be unique" });
    }
    value.nodes.forEach((node, i) => {
      if (node.group !== undefined && !groupIds.has(node.group)) {
        ctx.addIssue({
          code: "custom",
          path: ["nodes", i, "group"],
          message: `unknown group id "${node.group}"`,
        });
      }
    });
    // node ids and group ids share one flat id space in dagre's compound Graph and in
    // React Flow's node list (see layout.ts); allowing overlap would silently drop one
    // entry, so it is rejected here instead of namespaced away downstream.
    (value.groups ?? []).forEach((group, i) => {
      if (ids.has(group.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["groups", i, "id"],
          message: `group id "${group.id}" collides with a node id`,
        });
      }
    });
    // dagre's setEdge(from, to) collapses same-pair duplicates with no name, so allowing
    // them would only yield overlapping renders with no benefit.
    const seenEdges = new Set<string>();
    value.edges?.forEach((edge, i) => {
      for (const key of ["from", "to"] as const) {
        if (!ids.has(edge[key])) {
          ctx.addIssue({
            code: "custom",
            path: ["edges", i, key],
            message: `unknown node id "${edge[key]}"`,
          });
        }
      }
      const pairKey = `${edge.from}->${edge.to}`;
      if (seenEdges.has(pairKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["edges", i],
          message: `duplicate edge "${edge.from}" -> "${edge.to}"`,
        });
      }
      seenEdges.add(pairKey);
    });
  });

export type GraphProps = z.infer<typeof graphPropsSchema>;

type RoleStyle = {
  node: string;
  edge: string;
  edgeDashed: boolean;
  // SVG markers can't resolve dark: variants the way className can, so added/removed/
  // hotspot ride app-level CSS custom properties (styles.css) with their own light/dark
  // values instead of a raw tailwind color; neutral/changed lean on the app's existing
  // theme-aware vars.
  marker: string;
};

const roleStyles: Record<GraphRole, RoleStyle> = {
  added: {
    node: "border-emerald-600 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300",
    edge: "stroke-emerald-600 dark:stroke-emerald-400",
    edgeDashed: false,
    marker: "var(--graph-added)",
  },
  removed: {
    node: "border-dashed border-red-500/70 bg-transparent text-red-600/80 dark:text-red-400/80",
    edge: "stroke-red-500/70",
    edgeDashed: true,
    marker: "var(--graph-removed)",
  },
  hotspot: {
    node: "border-2 border-amber-600 bg-amber-500/15 text-amber-700 dark:border-amber-400 dark:text-amber-300",
    edge: "stroke-amber-600 dark:stroke-amber-400",
    edgeDashed: false,
    marker: "var(--graph-hotspot)",
  },
  neutral: {
    node: "border-border bg-card text-foreground",
    edge: "stroke-muted-foreground/60",
    edgeDashed: false,
    marker: "var(--muted-foreground)",
  },
  changed: {
    // touched-but-clean: a real hue (sky), distinct from added/removed/hotspot and from
    // neutral — the accent token this used to ride collapses to near-white in dark mode
    // and became indistinguishable from neutral.
    node: "border-sky-500 bg-sky-500/10 text-sky-700 dark:border-sky-400 dark:text-sky-300",
    edge: "stroke-sky-600 dark:stroke-sky-400",
    edgeDashed: false,
    marker: "var(--graph-changed)",
  },
};

// Fixed reading order for the legend, independent of prop order (nodes[].role /
// edges[].role appear in whatever order the producer listed them).
const roleOrder: readonly GraphRole[] = ["added", "removed", "hotspot", "changed", "neutral"];

// Hover state is delivered via context rather than baked into each node/edge's `data`, so
// hovering doesn't force flowNodes/flowEdges (and the whole ReactFlow tree) to rebuild.
type HoverState = { hoveredId: string | null; incident: ReadonlySet<string> };
const HoverContext = createContext<HoverState>({ hoveredId: null, incident: new Set() });

type RoleNodeData = {
  label: string;
  sub?: string;
  role: GraphRole;
  href?: string;
  direction: "TB" | "LR";
};

type GroupNodeData = { label?: string };

/** Directed-graph node: rounded box, label + optional muted subtitle, role-colored border/fill. */
const RoleNode = memo(function RoleNode({ id, data }: NodeProps<Node<RoleNodeData, "role">>) {
  const { hoveredId } = useContext(HoverContext);
  const sourcePos = data.direction === "LR" ? Position.Right : Position.Bottom;
  const targetPos = data.direction === "LR" ? Position.Left : Position.Top;
  return (
    <div
      data-role={data.role}
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-lg border px-2 text-center text-xs",
        roleStyles[data.role].node,
        data.href !== undefined && "cursor-pointer",
        hoveredId === id && "ring-2 ring-ring ring-offset-1 ring-offset-background",
      )}
    >
      <Handle type="target" position={targetPos} isConnectable={false} className="!opacity-0" />
      <span className="line-clamp-1 w-full text-sm">{data.label}</span>
      {data.sub !== undefined && (
        <span className="line-clamp-1 w-full text-xs opacity-70">{data.sub}</span>
      )}
      <Handle type="source" position={sourcePos} isConnectable={false} className="!opacity-0" />
    </div>
  );
});

/** Group/cluster box: dashed border, transparent fill, label riding the top-left edge. */
const GroupNode = memo(function GroupNode({ data }: NodeProps<Node<GroupNodeData, "group">>) {
  return (
    <div className="relative h-full w-full rounded-lg border border-dashed border-muted-foreground/40 bg-transparent">
      {data.label !== undefined && (
        <span className="-top-2.5 absolute left-2 rounded bg-background px-1 text-[10px] font-medium text-muted-foreground">
          {data.label}
        </span>
      )}
    </div>
  );
});

const nodeTypes: NodeTypes = { role: RoleNode, group: GroupNode };

type RoleEdgeData = { role: GraphRole; label?: string };

/** Smoothstep edge with role-colored stroke, optional label, and hover highlighting. */
const RoleEdge = memo(function RoleEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<Edge<RoleEdgeData, "role">>) {
  const { incident } = useContext(HoverContext);
  const role = data?.role ?? "neutral";
  const style = roleStyles[role];
  const highlighted = incident.has(id);
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={style.edge}
        style={{
          strokeWidth: highlighted ? 2.5 : 1.5,
          strokeOpacity: highlighted ? 1 : 0.75,
          strokeDasharray: style.edgeDashed ? "5 4" : undefined,
        }}
      />
      {data?.label !== undefined && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            className="rounded bg-background px-1 text-[10px] text-muted-foreground"
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

const edgeTypes = { role: RoleEdge };

const PADDING = 16;
// a fixed rem cap, not dvh (see Mermaid's pitfall note): the viewport can report 0 height
// in headless/measurement embeds, which would collapse the diagram to nothing
const MAX_HEIGHT_PX = 512; // 32rem at the app's 16px root

/**
 * Interactive architecture diagram: nodes = modules/files (optionally grouped into
 * module-boundary boxes), edges = relationships, role → color/stroke fixed by the renderer
 * so the reading of a diagram never drifts from generation to generation (the mermaid
 * instability problem this catalog node was built to avoid). Layout is dagre
 * (`./layout.ts`), deterministic and cycle-safe. `href:"#<id>"` on a node jumps to any node
 * carrying that `id` (typically the finding's `Heading`), reusing the same navigation the
 * `Link` catalog node uses. Pans/zooms, so dense graphs (15+ nodes) stay legible without
 * shrinking node text.
 */
export function Graph({ nodes, edges = [], groups = [], direction = "TB", caption }: GraphProps) {
  const scheme = useColorScheme();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // layoutGraph already drops dangling group/edge refs internally, so the component hands
  // the props straight through instead of re-filtering them here.
  const layout = useMemo(
    () => layoutGraph({ nodes, edges, groups, direction }),
    [nodes, edges, groups, direction],
  );

  const flowNodes: Node[] = useMemo(() => {
    const groupById = new Map(layout.groups.map((g) => [g.id, g]));
    const groupNodes: Node[] = layout.groups.map((g) => ({
      id: g.id,
      type: "group",
      position: { x: g.x, y: g.y },
      width: g.width,
      height: g.height,
      data: { label: g.label } satisfies GroupNodeData,
      draggable: false,
      selectable: false,
      zIndex: 0,
    }));
    const roleNodes: Node[] = layout.nodes.map((n) => {
      const parent = n.group !== undefined ? groupById.get(n.group) : undefined;
      return {
        id: n.id,
        type: "role",
        position: parent ? { x: n.x - parent.x, y: n.y - parent.y } : { x: n.x, y: n.y },
        width: n.width,
        height: n.height,
        parentId: parent?.id,
        extent: parent ? ("parent" as const) : undefined,
        data: {
          label: n.label,
          sub: n.sub,
          role: n.role as GraphRole,
          href: n.href,
          direction,
        } satisfies RoleNodeData,
        draggable: false,
        selectable: false,
        zIndex: 1,
      };
    });
    // parents must precede children in the array for React Flow to resolve parentId
    return [...groupNodes, ...roleNodes];
  }, [layout, direction]);

  const flowEdges: Edge[] = useMemo(
    () =>
      layout.edges.map((e) => {
        const role = e.role as GraphRole;
        return {
          id: `${e.from}->${e.to}`,
          source: e.from,
          target: e.to,
          type: "role",
          data: { role, label: e.label } satisfies RoleEdgeData,
          markerEnd: { type: MarkerType.ArrowClosed, color: roleStyles[role].marker },
        };
      }),
    [layout],
  );

  // ids of edges touching the hovered node, recomputed only when the hover target or the
  // layout changes — not on every render.
  const incidentEdges = useMemo(() => {
    if (hoveredId === null) return new Set<string>();
    const incident = new Set<string>();
    for (const e of layout.edges) {
      if (e.from === hoveredId || e.to === hoveredId) incident.add(`${e.from}->${e.to}`);
    }
    return incident;
  }, [hoveredId, layout]);

  const hoverValue = useMemo<HoverState>(
    () => ({ hoveredId, incident: incidentEdges }),
    [hoveredId, incidentEdges],
  );

  const handleNodeClick = useCallback((_event: unknown, node: Node) => {
    const href = (node.data as Partial<RoleNodeData>).href;
    if (href === undefined || !href.startsWith("#")) return;
    jumpToNode(href.slice(1));
  }, []);

  const handleNodeMouseEnter = useCallback((_event: unknown, node: Node) => {
    setHoveredId(node.id);
  }, []);
  const handleNodeMouseLeave = useCallback(() => setHoveredId(null), []);

  const containerHeight = Math.min(layout.height + PADDING * 2, MAX_HEIGHT_PX);

  // Roles resolved by layoutGraph (unset -> "neutral"), not the raw props, so an
  // omitted role still shows its actual (neutral) swatch and an unused role is omitted.
  const usedRoles = useMemo(() => {
    const present = new Set<GraphRole>();
    for (const n of layout.nodes) present.add(n.role as GraphRole);
    for (const e of layout.edges) present.add(e.role as GraphRole);
    return roleOrder.filter((role) => present.has(role));
  }, [layout]);

  return (
    <figure data-slot="graph" className="flex w-full max-w-full flex-col gap-2">
      <div
        className="w-full max-h-[32rem] overflow-hidden rounded-xl border border-border bg-card"
        style={{ height: containerHeight }}
      >
        {/* No mounted-gate needed: React Flow v12 renders under renderToString as long as
            every node carries explicit width/height (which layout.ts always provides), so
            SSR tests (Graph.test.tsx) exercise the real tree, not a server-only fallback. */}
        <HoverContext.Provider value={hoverValue}>
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag
            // the graph sits inside a long scrolling view: the wheel must keep scrolling the
            // page, not zoom the diagram (pinch and the Controls buttons still zoom)
            zoomOnScroll={false}
            preventScrolling={false}
            fitView
            // An overview must be legible before any interaction: unbounded fitView
            // shrinks a wide graph until labels are unreadable. Capping how far it can
            // zoom out trades "the whole graph visible at once" for "readable", leaving
            // the rest reachable by pan (or the Controls fit button, which respects the
            // same bounds).
            fitViewOptions={{ minZoom: 0.85, maxZoom: 1 }}
            proOptions={{ hideAttribution: true }}
            colorMode={scheme}
            onNodeClick={handleNodeClick}
            onNodeMouseEnter={handleNodeMouseEnter}
            onNodeMouseLeave={handleNodeMouseLeave}
          >
            <Controls showInteractive={false} />
          </ReactFlow>
        </HoverContext.Provider>
      </div>
      {/* Renderer-owned legend: producers never need to explain what a color means. One
          item per role actually present (via `usedRoles`, resolved from the laid-out
          graph so an unset role's "neutral" default is represented too), plus group and
          edge-direction items only when those exist in this graph. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        {usedRoles.map((role) => (
          <span key={role} className="flex items-center gap-1">
            <span className={cn("h-3 w-3 shrink-0 rounded border", roleStyles[role].node)} />
            {t.graph[role]}
          </span>
        ))}
        {layout.groups.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 shrink-0 rounded border border-dashed border-muted-foreground/40 bg-transparent" />
            {t.graph.group}
          </span>
        )}
        {layout.edges.length > 0 && <span>{t.graph.edge}</span>}
      </div>
      {caption !== undefined && (
        <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>
      )}
    </figure>
  );
}
