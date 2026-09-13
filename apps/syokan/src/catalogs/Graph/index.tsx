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
// React Flow's base stylesheet (pane transforms, handle hit-boxes). Imported here rather
// than via styles.css so the CSS travels with the component: Bun's bundler (dev server,
// compiled binary, apps/share Bun.build) and Storybook's Vite all collect CSS reached
// through JS imports.
import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, useState } from "react";
import { z } from "zod";
import { jumpToNode } from "../../lib/anchor";
import { useColorScheme } from "../../lib/useColorScheme";
import { groupKey, layoutGraph } from "./layout";

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
            // in-view jump to a finding card ("#<node id>"); never a URL
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
    });
  });

export type GraphProps = z.infer<typeof graphPropsSchema>;

const nodeRoleClass: Record<GraphRole, string> = {
  added:
    "border-emerald-600 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300",
  removed:
    "border-dashed border-red-500/70 bg-transparent text-red-600/80 dark:text-red-400/80",
  hotspot:
    "border-2 border-amber-600 bg-amber-500/15 text-amber-700 dark:border-amber-400 dark:text-amber-300",
  neutral: "border-border bg-card text-foreground",
  // touched-but-clean: the accent color, distinct from the added/removed/hotspot palette
  changed: "border-primary bg-primary/10 text-primary",
};

const edgeRoleClass: Record<GraphRole, { line: string; dashed: boolean }> = {
  added: { line: "stroke-emerald-600 dark:stroke-emerald-400", dashed: false },
  removed: { line: "stroke-red-500/70", dashed: true },
  hotspot: { line: "stroke-amber-600 dark:stroke-amber-400", dashed: false },
  neutral: { line: "stroke-muted-foreground/60", dashed: false },
  changed: { line: "stroke-primary", dashed: false },
};

// SVG markers can't resolve dark: variants the way className can, so added/removed/hotspot
// (raw tailwind palette, no CSS var) get an explicit light/dark pair; neutral/changed lean on
// the app's own theme-aware CSS vars and need no branching.
const markerColor: Record<GraphRole, string | { light: string; dark: string }> = {
  added: { light: "#059669", dark: "#34d399" },
  removed: { light: "rgba(239,68,68,0.7)", dark: "rgba(239,68,68,0.7)" },
  hotspot: { light: "#d97706", dark: "#fbbf24" },
  neutral: "var(--muted-foreground)",
  changed: "var(--primary)",
};

function resolveMarkerColor(role: GraphRole, scheme: "light" | "dark"): string {
  const c = markerColor[role];
  return typeof c === "string" ? c : c[scheme];
}

type RoleNodeData = {
  label: string;
  sub?: string;
  role: GraphRole;
  href?: string;
  hovered: boolean;
  direction: "TB" | "LR";
};

type GroupNodeData = { label?: string };

/** Directed-graph node: rounded box, label + optional muted subtitle, role-colored border/fill. */
function RoleNode({ data }: NodeProps<Node<RoleNodeData, "role">>) {
  const sourcePos = data.direction === "LR" ? Position.Right : Position.Bottom;
  const targetPos = data.direction === "LR" ? Position.Left : Position.Top;
  return (
    <div
      data-role={data.role}
      className={`flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-lg border px-2 text-center text-xs ${nodeRoleClass[data.role]} ${data.href !== undefined ? "cursor-pointer" : ""} ${data.hovered ? "ring-2 ring-ring ring-offset-1 ring-offset-background" : ""}`}
    >
      <Handle type="target" position={targetPos} isConnectable={false} className="!opacity-0" />
      <span className="line-clamp-1 w-full">{data.label}</span>
      {data.sub !== undefined && (
        <span className="line-clamp-1 w-full text-[10px] opacity-70">{data.sub}</span>
      )}
      <Handle type="source" position={sourcePos} isConnectable={false} className="!opacity-0" />
    </div>
  );
}

/** Group/cluster box: dashed border, transparent fill, label riding the top-left edge. */
function GroupNode({ data }: NodeProps<Node<GroupNodeData, "group">>) {
  return (
    <div className="relative h-full w-full rounded-lg border border-dashed border-muted-foreground/40 bg-transparent">
      {data.label !== undefined && (
        <span className="-top-2.5 absolute left-2 rounded bg-background px-1 text-[10px] font-medium text-muted-foreground">
          {data.label}
        </span>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = { role: RoleNode, group: GroupNode };

type RoleEdgeData = { role: GraphRole; label?: string; highlighted: boolean };

/** Smoothstep edge with role-colored stroke, optional label, and hover highlighting. */
function RoleEdge({
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
  const role = data?.role ?? "neutral";
  const style = edgeRoleClass[role];
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
        className={style.line}
        style={{
          strokeWidth: data?.highlighted ? 2.5 : 1.5,
          strokeOpacity: data?.highlighted ? 1 : 0.75,
          strokeDasharray: style.dashed ? "5 4" : undefined,
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
}

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
 * (`./layout.ts`), deterministic and cycle-safe. `href:"#<id>"` on a node jumps to that
 * anchor in-view (typically a finding `Card`), reusing the same navigation the `Link`
 * catalog node uses. Pans/zooms, so dense graphs (15+ nodes) stay legible without
 * shrinking node text.
 */
export function Graph({ nodes, edges = [], groups = [], direction = "TB", caption }: GraphProps) {
  const scheme = useColorScheme();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const knownNodeIds = new Set(nodes.map((n) => n.id));
  const knownGroupIds = new Set(groups.map((g) => g.id));
  // schema validation guarantees refs, but Storybook/direct use may not go through it
  const validEdges = edges.filter((e) => knownNodeIds.has(e.from) && knownNodeIds.has(e.to));
  const layoutNodes = nodes.map((n) => ({
    ...n,
    group: n.group !== undefined && knownGroupIds.has(n.group) ? n.group : undefined,
  }));

  const layout = useMemo(
    () => layoutGraph({ nodes: layoutNodes, edges: validEdges, groups, direction }),
    // biome-ignore lint/correctness/useExhaustiveDependencies: layoutNodes/validEdges are rebuilt each render; keying on the props avoids their unstable identity
    [nodes, edges, groups, direction],
  );

  const flowNodes: Node[] = useMemo(() => {
    const groupById = new Map(layout.groups.map((g) => [g.id, g]));
    const groupNodes: Node[] = layout.groups.map((g) => ({
      // namespaced: nodes[].id and groups[].id are independent id spaces in the schema, so
      // a node may share a string with a group (see layout.ts's groupKey doc comment) —
      // React Flow's node list is keyed by one flat `id`, and an un-namespaced collision
      // there silently drops one entry (this bit a real story: a group and a node both "skill").
      id: groupKey(g.id),
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
        parentId: parent ? groupKey(parent.id) : undefined,
        extent: parent ? ("parent" as const) : undefined,
        data: {
          label: n.label,
          sub: n.sub,
          role: n.role as GraphRole,
          href: n.href,
          hovered: hoveredId === n.id,
          direction,
        } satisfies RoleNodeData,
        draggable: false,
        selectable: false,
        zIndex: 1,
      };
    });
    // parents must precede children in the array for React Flow to resolve parentId
    return [...groupNodes, ...roleNodes];
  }, [layout, hoveredId, direction]);

  const flowEdges: Edge[] = useMemo(
    () =>
      layout.edges.map((e, i) => {
        const role = e.role as GraphRole;
        return {
          // index-suffixed: two edges may share the same from/to (e.g. differing roles across re-posts)
          id: `${e.from}->${e.to}-${i}`,
          source: e.from,
          target: e.to,
          type: "role",
          data: {
            role,
            label: e.label,
            highlighted: hoveredId !== null && (hoveredId === e.from || hoveredId === e.to),
          } satisfies RoleEdgeData,
          markerEnd: { type: MarkerType.ArrowClosed, color: resolveMarkerColor(role, scheme) },
        };
      }),
    [layout, hoveredId, scheme],
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

  return (
    <figure data-slot="graph" className="flex w-full max-w-full flex-col gap-2">
      <div
        className="w-full max-h-[32rem] overflow-hidden rounded-xl border border-border bg-card"
        style={{ height: containerHeight }}
      >
        {/* No mounted-gate needed: React Flow v12 renders under renderToString as long as
            every node carries explicit width/height (which layout.ts always provides), so
            SSR tests (Graph.test.tsx) exercise the real tree, not a server-only fallback. */}
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
          proOptions={{ hideAttribution: true }}
          colorMode={scheme}
          onNodeClick={handleNodeClick}
          onNodeMouseEnter={handleNodeMouseEnter}
          onNodeMouseLeave={handleNodeMouseLeave}
        >
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {caption !== undefined && (
        <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>
      )}
    </figure>
  );
}
