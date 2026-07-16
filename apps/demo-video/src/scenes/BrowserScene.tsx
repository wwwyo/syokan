import type { CSSProperties } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  useCurrentFrame,
} from "remotion";
import type { DemoPr } from "../fixture";
import { diff, graph, prs, viewTitle, viewUrl } from "../fixture";
import { color, font, logoPaths, radius } from "../theme";

const EASE = Easing.bezier(0.16, 1, 0.3, 1);
const POP = Easing.bezier(0.34, 1.56, 0.64, 1);
// Symmetric ease so the camera never lurches at either end.
const SCROLL_EASE = Easing.bezier(0.33, 0, 0.25, 1);
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const WINDOW_W = 1760;
const WINDOW_H = 1000;
const CHROME_H = 56;
const HEADER_H = 60;
const SIDEBAR_W = 360;
// Window border eats 2px of the flex column.
const VIEWPORT_H = WINDOW_H - 2 - CHROME_H - HEADER_H;
const CONTENT_W = 1060;
const CARD_PAD = 28;
const GRAPH_W = CONTENT_W - CARD_PAD * 2;
const GRAPH_H = 240;

const FADE_END = 15;
const H1_START = 25;
const CARD_STARTS = [52, 200, 245] as const;
const CARD_DUR = 20;
// Spark flashes just before its card pops in — the summon motif.
const SPARK_LEAD = 10;
const SPARK_DUR = 16;
const DIFF_START = 70;
const DIFF_ROW_STAGGER = 4;
const GRAPH_START = 150;
const NODE_STAGGER = 6;
const EDGE_START = GRAPH_START + 22;
const SCROLL_START = 140;
const SCROLL_END = 285;

const BADGE_VARIANTS: Record<DemoPr["badge"]["variant"], CSSProperties> = {
  default: { background: color.primary, color: color.card },
  destructive: {
    background: "rgba(232, 106, 94, 0.12)",
    color: color.destructive,
  },
  outline: {
    border: `1px solid ${color.border}`,
    color: color.foreground,
  },
};

const Badge = ({ badge }: { badge: DemoPr["badge"] }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      alignSelf: "flex-start",
      height: 28,
      borderRadius: 9999,
      padding: "0 12px",
      fontSize: 15,
      fontWeight: 500,
      ...BADGE_VARIANTS[badge.variant],
    }}
  >
    {badge.text}
  </span>
);

const Logo = () => (
  <svg width={34} height={34} viewBox="0 0 100 100">
    <path
      d={logoPaths.braceLeft}
      stroke={color.foreground}
      strokeWidth={3.2}
      fill="none"
      strokeLinecap="round"
    />
    <path
      d={logoPaths.braceRight}
      stroke={color.foreground}
      strokeWidth={3.2}
      fill="none"
      strokeLinecap="round"
    />
    <path d={logoPaths.spark} fill={color.foreground} />
  </svg>
);

/** ✦ flash at the card center. Local frame 0 = Sequence start. */
const SummonSpark = () => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 8, SPARK_DUR], [0, 1.2, 0], {
    ...CLAMP,
    easing: EASE,
  });
  const opacity = interpolate(frame, [0, 5, SPARK_DUR], [0, 1, 0], CLAMP);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <svg
        width={56}
        height={56}
        viewBox="0 0 100 100"
        style={{ scale: String(scale), opacity }}
      >
        <path d={logoPaths.spark} fill={color.foreground} />
      </svg>
    </div>
  );
};

const ChromeBar = () => (
  <div
    style={{
      height: CHROME_H,
      flexShrink: 0,
      borderBottom: `1px solid ${color.border}`,
      display: "flex",
      alignItems: "center",
      padding: "0 24px",
      position: "relative",
    }}
  >
    <div style={{ display: "flex", gap: 10 }}>
      {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
        <div
          key={c}
          style={{ width: 14, height: 14, borderRadius: "50%", background: c }}
        />
      ))}
    </div>
    <div
      style={{
        position: "absolute",
        left: "50%",
        translate: "-50% 0",
        background: color.secondary,
        borderRadius: 9999,
        padding: "8px 28px",
        fontFamily: font.mono,
        fontSize: 18,
        color: color.mutedForeground,
      }}
    >
      {viewUrl}
    </div>
  </div>
);

const Sidebar = () => (
  <div
    style={{
      width: SIDEBAR_W,
      boxSizing: "border-box",
      flexShrink: 0,
      borderRight: `1px solid ${color.border}`,
      padding: 24,
      display: "flex",
      flexDirection: "column",
      gap: 32,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Logo />
      <span style={{ fontSize: 22, fontWeight: 600, color: color.foreground }}>
        syokan
      </span>
    </div>
    <nav
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        fontSize: 19,
      }}
    >
      <div
        style={{
          background: color.secondary,
          color: color.foreground,
          borderRadius: 8,
          padding: "12px 16px",
        }}
      >
        {viewTitle}
      </div>
      <div style={{ color: color.mutedForeground, padding: "12px 16px" }}>
        Today's RSS
      </div>
      <div style={{ color: color.mutedForeground, padding: "12px 16px" }}>
        standup notes 07-04
      </div>
    </nav>
  </div>
);

const ViewHeader = () => (
  <div
    style={{
      height: HEADER_H,
      flexShrink: 0,
      borderBottom: `1px solid ${color.border}`,
      display: "flex",
      alignItems: "center",
      padding: "0 32px",
    }}
  />
);

type DiffLine = (typeof diff.lines)[number];
type DiffRow =
  | { kind: "file" }
  | { kind: "hunk" }
  | { kind: "line"; line: DiffLine }
  | { kind: "comment" };

const diffRows: DiffRow[] = [
  { kind: "file" },
  { kind: "hunk" },
  ...diff.lines.flatMap((line, i): DiffRow[] =>
    i === diff.comment.afterLineIndex
      ? [{ kind: "line", line }, { kind: "comment" }]
      : [{ kind: "line", line }],
  ),
];

const LINE_COLORS = {
  removed: { bg: color.diffRemovedBg, accent: color.diffRemovedText },
  added: { bg: color.diffAddedBg, accent: color.diffAddedText },
  context: { bg: "transparent", accent: color.mutedForeground },
} as const;

const gutterStyle: CSSProperties = {
  width: 56,
  boxSizing: "border-box",
  flexShrink: 0,
  textAlign: "right",
  paddingRight: 14,
};

const DiffCodeLine = ({ line }: { line: DiffLine }) => {
  const c = LINE_COLORS[line.kind];
  const marker =
    line.kind === "removed" ? "-" : line.kind === "added" ? "+" : "";
  return (
    <div
      style={{
        display: "flex",
        fontFamily: font.mono,
        fontSize: 19,
        lineHeight: "32px",
        whiteSpace: "pre",
        background: c.bg,
      }}
    >
      <span style={{ ...gutterStyle, color: c.accent }}>
        {"oldNo" in line ? line.oldNo : ""}
      </span>
      <span style={{ ...gutterStyle, color: c.accent }}>
        {"newNo" in line ? line.newNo : ""}
      </span>
      <span
        style={{ width: 28, flexShrink: 0, textAlign: "center", color: c.accent }}
      >
        {marker}
      </span>
      <span style={{ color: color.foreground }}>{line.text}</span>
    </div>
  );
};

const ReviewComment = () => (
  <div style={{ padding: "10px 16px" }}>
    <div
      style={{
        background: color.card,
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: 8,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: color.secondary,
            color: color.mutedForeground,
            fontSize: 14,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {diff.comment.author.slice(0, 1)}
        </span>
        <span
          style={{ fontSize: 17, fontWeight: 600, color: color.foreground }}
        >
          {diff.comment.author}
        </span>
      </div>
      <div style={{ fontSize: 18, lineHeight: 1.5, color: color.foreground }}>
        {diff.comment.body}
      </div>
    </div>
  </div>
);

/** Unified diff pane; rows cascade in top-down, the review comment pops. */
const DiffBlock = () => {
  const frame = useCurrentFrame();
  const containerOpacity = interpolate(
    frame,
    [DIFF_START - 6, DIFF_START + 4],
    [0, 1],
    { ...CLAMP, easing: EASE },
  );
  return (
    <div
      style={{
        border: `1px solid ${color.border}`,
        borderRadius: 8,
        overflow: "hidden",
        background: color.background,
        opacity: containerOpacity,
      }}
    >
      {diffRows.map((row, idx) => {
        const start = DIFF_START + idx * DIFF_ROW_STAGGER;
        const t = interpolate(
          frame,
          [start, start + (row.kind === "comment" ? 14 : 10)],
          [0, 1],
          { ...CLAMP, easing: row.kind === "comment" ? POP : EASE },
        );
        const opacity = interpolate(frame, [start, start + 8], [0, 1], CLAMP);
        const reveal: CSSProperties =
          row.kind === "comment"
            ? { opacity, scale: String(0.95 + 0.05 * t) }
            : { opacity, translate: `0 ${6 * (1 - t)}px` };

        if (row.kind === "file") {
          return (
            <div
              key="file"
              style={{
                fontFamily: font.mono,
                fontSize: 17,
                color: color.mutedForeground,
                padding: "10px 16px",
                background: color.secondary,
                borderBottom: `1px solid ${color.border}`,
                ...reveal,
              }}
            >
              {diff.fileName}
            </div>
          );
        }
        if (row.kind === "hunk") {
          return (
            <div
              key="hunk"
              style={{
                fontFamily: font.mono,
                fontSize: 19,
                lineHeight: "32px",
                whiteSpace: "pre",
                color: color.diffHunkText,
                padding: "3px 16px",
                background: "rgba(255, 255, 255, 0.04)",
                ...reveal,
              }}
            >
              {diff.hunkHeader}
            </div>
          );
        }
        if (row.kind === "comment") {
          return (
            <div key="comment" style={reveal}>
              <ReviewComment />
            </div>
          );
        }
        return (
          <div key={row.line.text} style={reveal}>
            <DiffCodeLine line={row.line} />
          </div>
        );
      })}
    </div>
  );
};

type GraphNodeRole = (typeof graph.nodes)[number]["role"];
type GraphEdgeRole = (typeof graph.edges)[number]["role"];

const NODE_STYLES: Record<
  GraphNodeRole,
  { fill: string; stroke: string; label: string; dash?: string; sw: number }
> = {
  neutral: {
    fill: color.card,
    stroke: color.border,
    label: color.foreground,
    sw: 1,
  },
  hotspot: {
    fill: color.graphHotspotBg,
    stroke: color.graphHotspot,
    label: color.graphHotspotLabel,
    sw: 2,
  },
  removed: {
    fill: "none",
    stroke: color.graphRemoved,
    label: color.graphRemovedLabel,
    dash: "5 4",
    sw: 1.5,
  },
  added: {
    fill: color.graphAddedBg,
    stroke: color.graphAdded,
    label: color.graphAddedLabel,
    sw: 1.5,
  },
};

const EDGE_COLORS: Record<GraphEdgeRole, string> = {
  neutral: color.mutedForeground,
  removed: color.graphRemoved,
  added: color.graphAdded,
};

// Left-to-right layout precomputed for GRAPH_W×GRAPH_H (the real catalog lays out automatically).
const NODE_LAYOUT: Record<
  (typeof graph.nodes)[number]["id"],
  { cx: number; cy: number; w: number; h: number }
> = {
  "client-sdk": { cx: 105, cy: 120, w: 190, h: 52 },
  "events-api": { cx: 455, cy: 120, w: 190, h: 52 },
  "offset-paginator": { cx: 865, cy: 40, w: 250, h: 52 },
  "cursor-codec": { cx: 865, cy: 200, w: 250, h: 52 },
};

/** Dependency sketch; nodes pop as they scroll into view, edges fade in after. */
const GraphBlock = () => {
  const frame = useCurrentFrame();
  const captionOpacity = interpolate(
    frame,
    [EDGE_START + 8, EDGE_START + 22],
    [0, 1],
    { ...CLAMP, easing: EASE },
  );
  return (
    <div>
      <svg
        width="100%"
        viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
        style={{ display: "block" }}
      >
        {graph.edges.map((edge, i) => {
          const from = NODE_LAYOUT[edge.from];
          const to = NODE_LAYOUT[edge.to];
          const x1 = from.cx + from.w / 2 + 2;
          const x2 = to.cx - to.w / 2 - 12;
          const mx = (x1 + x2) / 2;
          const tip = to.cx - to.w / 2 - 1;
          const opacity = interpolate(
            frame,
            [EDGE_START + i * 5, EDGE_START + i * 5 + 12],
            [0, 1],
            { ...CLAMP, easing: EASE },
          );
          const stroke = EDGE_COLORS[edge.role];
          return (
            <g key={`${edge.from}-${edge.to}`} style={{ opacity }}>
              <path
                d={`M ${x1} ${from.cy} C ${mx} ${from.cy}, ${mx} ${to.cy}, ${x2} ${to.cy}`}
                fill="none"
                stroke={stroke}
                strokeWidth={1.75}
                strokeDasharray={edge.role === "removed" ? "5 4" : undefined}
              />
              <polygon
                points={`${tip},${to.cy} ${tip - 12},${to.cy - 6} ${tip - 12},${to.cy + 6}`}
                fill={stroke}
              />
            </g>
          );
        })}
        {graph.nodes.map((node, i) => {
          const s = NODE_STYLES[node.role];
          const l = NODE_LAYOUT[node.id];
          const start = GRAPH_START + i * NODE_STAGGER;
          const t = interpolate(frame, [start, start + 14], [0, 1], {
            ...CLAMP,
            easing: POP,
          });
          const opacity = interpolate(
            frame,
            [start, start + 10],
            [0, 1],
            CLAMP,
          );
          return (
            <g key={node.id} style={{ translate: `${l.cx}px ${l.cy}px` }}>
              <g style={{ scale: String(0.9 + 0.1 * t), opacity }}>
                <rect
                  x={-l.w / 2}
                  y={-l.h / 2}
                  width={l.w}
                  height={l.h}
                  rx={8}
                  fill={s.fill}
                  stroke={s.stroke}
                  strokeWidth={s.sw}
                  strokeDasharray={s.dash}
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily={font.sans}
                  fontSize={17}
                  fontWeight={500}
                  fill={s.label}
                >
                  {node.label}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
      <div
        style={{
          marginTop: 8,
          fontSize: 16,
          color: color.mutedForeground,
          opacity: captionOpacity,
        }}
      >
        {graph.caption}
      </div>
    </div>
  );
};

export const BrowserScene = () => {
  const frame = useCurrentFrame();

  const sceneOpacity = interpolate(frame, [0, FADE_END], [0, 1], {
    ...CLAMP,
    easing: EASE,
  });
  const sceneScale = interpolate(frame, [0, FADE_END], [0.98, 1], {
    ...CLAMP,
    easing: EASE,
  });

  const h1T = interpolate(frame, [H1_START, H1_START + 18], [0, 1], {
    ...CLAMP,
    easing: EASE,
  });

  // 100% is the scroll column's own height, so the end position lands exactly
  // at the content bottom without knowing the rendered height up front.
  const scrollT = interpolate(frame, [SCROLL_START, SCROLL_END], [0, 1], {
    ...CLAMP,
    easing: SCROLL_EASE,
  });

  return (
    <AbsoluteFill
      style={{
        background: color.background,
        fontFamily: font.sans,
        alignItems: "center",
        justifyContent: "center",
        opacity: sceneOpacity,
        scale: String(sceneScale),
      }}
    >
      <div
        style={{
          width: WINDOW_W,
          height: WINDOW_H,
          boxSizing: "border-box",
          borderRadius: radius.window,
          border: `1px solid ${color.border}`,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <ChromeBar />
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <Sidebar />
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            <ViewHeader />
            {/* Body viewport: only this pane scrolls, like the real app. */}
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  translate: `0 calc(${scrollT} * (${VIEWPORT_H}px - 100%))`,
                }}
              >
                <div
                  style={{
                    width: CONTENT_W,
                    paddingTop: 40,
                    paddingBottom: 40,
                  }}
                >
                  <h1
                    style={{
                      fontSize: 42,
                      fontWeight: 600,
                      letterSpacing: "-0.02em",
                      lineHeight: 1.1,
                      margin: "0 0 28px",
                      color: color.foreground,
                      opacity: h1T,
                      translate: `0 ${16 * (1 - h1T)}px`,
                    }}
                  >
                    {viewTitle}
                  </h1>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 32,
                    }}
                  >
                    {prs.map((pr, i) => {
                      const start = CARD_STARTS[i] ?? 0;
                      // Overshooting easing gives the pop; opacity uses the plain ease.
                      const t = interpolate(
                        frame,
                        [start, start + CARD_DUR],
                        [0, 1],
                        { ...CLAMP, easing: POP },
                      );
                      const cardOpacity = interpolate(
                        frame,
                        [start, start + CARD_DUR - 6],
                        [0, 1],
                        { ...CLAMP, easing: EASE },
                      );
                      return (
                        // Wrapper stays mounted so layout is stable and the
                        // spark can center on the card's final position.
                        <div key={pr.title} style={{ position: "relative" }}>
                          <div
                            style={{
                              background: color.card,
                              borderRadius: radius.card,
                              border: "1px solid rgba(255, 255, 255, 0.1)",
                              padding: CARD_PAD,
                              display: "flex",
                              flexDirection: "column",
                              gap: 14,
                              opacity: cardOpacity,
                              scale: String(0.96 + 0.04 * t),
                              translate: `0 ${20 * (1 - t)}px`,
                            }}
                          >
                            <h3
                              style={{
                                fontSize: 22,
                                fontWeight: 600,
                                lineHeight: 1.2,
                                margin: 0,
                                color: color.foreground,
                              }}
                            >
                              {pr.title}
                            </h3>
                            <Badge badge={pr.badge} />
                            <div
                              style={{
                                fontSize: 16,
                                lineHeight: 1.25,
                                color: color.mutedForeground,
                              }}
                            >
                              {pr.repoLine}
                            </div>
                            <div
                              style={{
                                fontSize: 20,
                                lineHeight: 1.55,
                                color: color.foreground,
                              }}
                            >
                              {pr.summary}
                            </div>
                            {i === 0 && (
                              <>
                                <DiffBlock />
                                <GraphBlock />
                              </>
                            )}
                          </div>
                          <Sequence
                            from={start - SPARK_LEAD}
                            durationInFrames={SPARK_DUR}
                            layout="none"
                          >
                            <SummonSpark />
                          </Sequence>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
