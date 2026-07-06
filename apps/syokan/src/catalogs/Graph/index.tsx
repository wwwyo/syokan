import { useId } from "react";
import { z } from "zod";
import { layoutGraph } from "./layout";

// role = semantic classification; color and stroke are fixed here so the reading of a
// diagram never varies from generation to generation (the mermaid instability problem).
const roleSchema = z.enum(["added", "removed", "hotspot", "neutral"]);

export type GraphRole = z.infer<typeof roleSchema>;

export const graphPropsSchema = z
  .object({
    nodes: z
      .array(
        z
          .object({
            id: z.string().min(1),
            label: z.string().min(1).optional(),
            role: roleSchema.optional(),
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
          })
          .strict(),
      )
      .optional(),
    caption: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set(value.nodes.map((n) => n.id));
    if (ids.size !== value.nodes.length) {
      ctx.addIssue({ code: "custom", path: ["nodes"], message: "node ids must be unique" });
    }
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

const nodeStyles: Record<GraphRole, { box: string; label: string; dashed: boolean }> = {
  added: {
    box: "fill-emerald-500/10 stroke-emerald-600 dark:stroke-emerald-400",
    label: "fill-emerald-700 dark:fill-emerald-300",
    dashed: false,
  },
  removed: {
    box: "fill-transparent stroke-red-500/70",
    label: "fill-red-600/80 dark:fill-red-400/80",
    dashed: true,
  },
  hotspot: {
    box: "fill-amber-500/15 stroke-amber-600 dark:stroke-amber-400",
    label: "fill-amber-700 dark:fill-amber-300",
    dashed: false,
  },
  neutral: {
    box: "fill-card stroke-border",
    label: "fill-foreground",
    dashed: false,
  },
};

const edgeStyles: Record<GraphRole, { line: string; dashed: boolean }> = {
  added: { line: "stroke-emerald-600 dark:stroke-emerald-400", dashed: false },
  removed: { line: "stroke-red-500/70", dashed: true },
  hotspot: { line: "stroke-amber-600 dark:stroke-amber-400", dashed: false },
  neutral: { line: "stroke-muted-foreground/60", dashed: false },
};

const arrowFill: Record<GraphRole, string> = {
  added: "fill-emerald-600 dark:fill-emerald-400",
  removed: "fill-red-500/70",
  hotspot: "fill-amber-600 dark:fill-amber-400",
  neutral: "fill-muted-foreground/60",
};

const PADDING = 8;

/**
 * Static directed graph with fixed role semantics (added / removed / hotspot /
 * neutral) for dependency and flow sketches; put two side by side (Stack
 * direction="horizontal") for a before/after contrast. Deliberately not mermaid:
 * the layout is deterministic and role styling cannot drift per generation.
 */
export function Graph({ nodes, edges = [], caption }: GraphProps) {
  const markerPrefix = useId();
  const roleOf = new Map(nodes.map((n) => [n.id, n.role ?? "neutral"] as const));
  // schema validation guarantees refs, but Storybook/direct use may not go through it;
  // filtering keeps layout.edges index-aligned with this array
  const validEdges = edges.filter((e) => roleOf.has(e.from) && roleOf.has(e.to));
  const layout = layoutGraph(nodes, validEdges);
  const width = layout.width + PADDING * 2;
  const height = layout.height + PADDING * 2;
  return (
    <figure data-slot="graph" className="flex max-w-full flex-col gap-2">
      <div className="overflow-x-auto">
        <svg
          viewBox={`${-PADDING} ${-PADDING} ${width} ${height}`}
          width={width}
          height={height}
          className="max-w-full"
          role="img"
          aria-label={caption ?? "graph"}
        >
          <defs>
            {(Object.keys(arrowFill) as GraphRole[]).map((role) => (
              <marker
                key={role}
                id={`${markerPrefix}-${role}`}
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L8,4 L0,8 z" className={arrowFill[role]} />
              </marker>
            ))}
          </defs>
          {layout.edges.map((edge, i) => {
            const role = validEdges[i]?.role ?? "neutral";
            const style = edgeStyles[role];
            const { x1, y1, c1x, c1y, c2x, c2y, x2, y2 } = edge.path;
            return (
              <path
                // biome-ignore lint/suspicious/noArrayIndexKey: static content, order never changes
                key={i}
                d={`M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`}
                fill="none"
                strokeWidth={1.5}
                strokeDasharray={style.dashed ? "5 4" : undefined}
                className={style.line}
                markerEnd={`url(#${markerPrefix}-${role})`}
              />
            );
          })}
          {layout.nodes.map((node) => {
            const role = roleOf.get(node.id) ?? "neutral";
            const style = nodeStyles[role];
            return (
              <g key={node.id} data-role={role}>
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx={8}
                  strokeWidth={role === "hotspot" ? 2 : 1.25}
                  strokeDasharray={style.dashed ? "5 4" : undefined}
                  className={style.box}
                />
                <text
                  x={node.x + node.width / 2}
                  y={node.y + node.height / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={`${style.label} text-xs`}
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {caption !== undefined && (
        <figcaption className="text-xs text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
