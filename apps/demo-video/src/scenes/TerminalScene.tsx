import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { envelopeLines, userPrompt, viewUrl } from "../fixture";
import { color, font, radius } from "../theme";

const EASE = Easing.bezier(0.16, 1, 0.3, 1);
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const WINDOW_W = 1560;
const WINDOW_H = 880;
const TITLEBAR_H = 56;
const PAD = 40;
const FONT_SIZE = 30;
const LINE_H = 45;
// Visible content height inside the window; drives the auto-scroll.
const VIEW_H = WINDOW_H - TITLEBAR_H - PAD * 2;
// Conservative chars-per-wrapped-line estimate (mono advance ~0.6em). Underestimating
// keeps the newest line above the bottom edge even if the real font wraps later.
const CHARS_PER_LINE = 78;

const TYPE_START = 6;
const TYPE_END = 70;
const ENV_START = 130;

type RowDef =
  | { kind: "prompt"; start: number }
  | { kind: "claude"; start: number; text: string }
  | { kind: "blank"; start: number }
  | { kind: "json"; start: number; line: string }
  | { kind: "post"; start: number }
  | { kind: "summon"; start: number };

// Stream pace: first lines land slowly, then accelerate to a steady 3 frames/line.
const envRows: RowDef[] = (() => {
  let t = ENV_START;
  return envelopeLines.map((line, i) => {
    const start = t;
    t += Math.max(3, 8 - i * 0.6);
    return { kind: "json", start, line };
  });
})();

const rows: RowDef[] = [
  { kind: "prompt", start: 0 },
  { kind: "blank", start: 84 },
  { kind: "claude", start: 86, text: "Fetching open pull requests via gh…" },
  { kind: "claude", start: 106, text: "Composing snapshot envelope" },
  { kind: "blank", start: ENV_START },
  ...envRows,
  { kind: "blank", start: 252 },
  { kind: "post", start: 258 },
  { kind: "summon", start: 282 },
];

const wrapCount = (line: string) => Math.max(1, Math.ceil(line.length / CHARS_PER_LINE));

const rowHeight = (row: RowDef) => (row.kind === "json" ? wrapCount(row.line) : 1) * LINE_H;

type Token = { text: string; tokenColor: string };

// String literals followed by ":" are keys; everything outside quotes is punctuation.
const highlightJsonLine = (line: string): Token[] => {
  const tokens: Token[] = [];
  const stringRe = /"(?:[^"\\]|\\.)*"/g;
  let last = 0;
  let match: RegExpExecArray | null = stringRe.exec(line);
  while (match !== null) {
    if (match.index > last) {
      tokens.push({ text: line.slice(last, match.index), tokenColor: color.jsonPunct });
    }
    const isKey = line.slice(stringRe.lastIndex).trimStart().startsWith(":");
    tokens.push({ text: match[0], tokenColor: isKey ? color.jsonKey : color.jsonString });
    last = stringRe.lastIndex;
    match = stringRe.exec(line);
  }
  if (last < line.length) {
    tokens.push({ text: line.slice(last), tokenColor: color.jsonPunct });
  }
  return tokens;
};

const trafficLightColors = ["#ff5f57", "#febc2e", "#28c840"] as const;

export const TerminalScene = () => {
  const frame = useCurrentFrame();

  const typedCount = Math.floor(
    interpolate(frame, [TYPE_START, TYPE_END], [0, userPrompt.length], CLAMP),
  );
  const cursorVisible = frame < 84;

  // Revealed content height as a continuous function of frame → smooth auto-scroll
  // that keeps the newest line inside the viewport.
  const revealedHeight = rows.reduce(
    (sum, row) => sum + interpolate(frame, [row.start, row.start + 6], [0, rowHeight(row)], CLAMP),
    0,
  );
  const scrollY = Math.max(0, revealedHeight - VIEW_H);

  const renderRowContent = (row: RowDef) => {
    switch (row.kind) {
      case "prompt":
        return (
          <>
            <span style={{ color: color.mutedForeground }}>{"❯ "}</span>
            <span style={{ color: color.foreground }}>{userPrompt.slice(0, typedCount)}</span>
            {cursorVisible ? (
              <span
                style={{
                  display: "inline-block",
                  width: 16,
                  height: 34,
                  verticalAlign: "-6px",
                  backgroundColor: color.foreground,
                  opacity: frame % 32 < 16 ? 1 : 0,
                }}
              />
            ) : null}
          </>
        );
      case "claude":
        return (
          <>
            <span style={{ color: color.claude }}>{"● "}</span>
            <span style={{ color: color.foreground }}>{row.text}</span>
          </>
        );
      case "json":
        return highlightJsonLine(row.line).map((token, i) => (
          <span key={i} style={{ color: token.tokenColor }}>
            {token.text}
          </span>
        ));
      case "post":
        return (
          <>
            <span style={{ color: color.foreground }}>POST /api/snapshots</span>
            <span style={{ color: color.jsonPunct }}>{" → "}</span>
            <span style={{ color: color.jsonString }}>201 Created</span>
          </>
        );
      case "summon":
        return (
          <>
            <span style={{ color: color.jsonString }}>{"✓ "}</span>
            <span style={{ color: color.foreground }}>{"Summoned  "}</span>
            <span style={{ color: color.foreground, textDecoration: "underline" }}>{viewUrl}</span>
          </>
        );
      case "blank":
        return null;
    }
  };

  return (
    <AbsoluteFill
      style={{
        backgroundColor: color.background,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: WINDOW_W,
          height: WINDOW_H,
          borderRadius: radius.window,
          border: `1px solid ${color.border}`,
          backgroundColor: "#111111",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.5)",
          overflow: "hidden",
          opacity: interpolate(frame, [0, 12], [0, 1], CLAMP),
          scale: String(interpolate(frame, [0, 16], [0.98, 1], { ...CLAMP, easing: EASE })),
        }}
      >
        <div
          style={{
            position: "relative",
            height: TITLEBAR_H,
            borderBottom: `1px solid ${color.border}`,
            display: "flex",
            alignItems: "center",
            paddingLeft: 24,
            gap: 10,
          }}
        >
          {trafficLightColors.map((c) => (
            <div key={c} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: c }} />
          ))}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: font.sans,
              fontSize: 24,
              color: color.mutedForeground,
            }}
          >
            claude — ~/work
          </div>
        </div>
        <div style={{ height: VIEW_H + PAD * 2, padding: PAD, overflow: "hidden" }}>
          <div style={{ translate: `0 ${-scrollY}px` }}>
            {rows.map((row, i) => (
              <div
                key={i}
                style={{
                  fontFamily: font.mono,
                  fontSize: FONT_SIZE,
                  lineHeight: `${LINE_H}px`,
                  whiteSpace: "pre-wrap",
                  minHeight: LINE_H,
                  opacity: interpolate(frame, [row.start, row.start + 8], [0, 1], CLAMP),
                  translate: `0 ${interpolate(frame, [row.start, row.start + 10], [10, 0], {
                    ...CLAMP,
                    easing: EASE,
                  })}px`,
                }}
              >
                {renderRowContent(row)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
