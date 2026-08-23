/**
 * Brand tokens mirrored from apps/syokan/src/styles.css (dark mode).
 * The oklch tokens map onto the Tailwind neutral scale — hex values below
 * are those neutrals, so the video matches the real UI without loading CSS.
 */
export const color = {
  background: "#0a0a0a", // oklch(0.145 0 0)
  foreground: "#fafafa", // oklch(0.985 0 0)
  card: "#171717", // oklch(0.205 0 0)
  secondary: "#262626", // oklch(0.269 0 0)
  mutedForeground: "#a3a3a3", // oklch(0.708 0 0)
  primary: "#e5e5e5", // oklch(0.922 0 0)
  destructive: "#e86a5e", // oklch(0.704 0.191 22.216)
  border: "rgba(255, 255, 255, 0.1)",
  // Claude Code accent used only inside the terminal scene
  claude: "#d97757",
  // JSON syntax highlight (terminal scene)
  jsonKey: "#8ab4f8",
  jsonString: "#87d996",
  jsonPunct: "#737373",
  // Graph catalog role colors (Tailwind emerald/red/amber, dark variants)
  graphAdded: "#34d399", // emerald-400
  graphAddedBg: "rgba(16, 185, 129, 0.1)", // emerald-500/10
  graphAddedLabel: "#6ee7b7", // emerald-300
  graphRemoved: "rgba(239, 68, 68, 0.7)", // red-500/70
  graphRemovedLabel: "rgba(248, 113, 113, 0.8)", // red-400/80
  graphHotspot: "#fbbf24", // amber-400
  graphHotspotBg: "rgba(245, 158, 11, 0.15)", // amber-500/15
  graphHotspotLabel: "#fcd34d", // amber-300
  // Diff catalog (pierre github-dark theme approximation)
  diffAddedBg: "rgba(46, 160, 67, 0.15)",
  diffAddedText: "#3fb950",
  diffRemovedBg: "rgba(248, 81, 73, 0.1)",
  diffRemovedText: "#f85149",
  diffHunkText: "#8b949e",
} as const;

export const font = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  // Wordmark uses Cormorant 600 in the product; the end card loads it via @remotion/google-fonts
} as const;

export const radius = {
  card: 12, // rounded-xl
  window: 16,
} as const;

/** Timeline (30 fps). Scenes overlap slightly so enter animations cover the seam. */
export const FPS = 30;
export const timeline = {
  terminal: { from: 0, duration: 320 },
  browser: { from: 300, duration: 430 },
  endCard: { from: 710, duration: 160 },
  total: 870,
} as const;

/** Logo geometry from apps/syokan/src/components/Logo/index.tsx (viewBox 0 0 100 100) */
export const logoPaths = {
  braceLeft:
    "M32 15 C24 15,24 21,24 31 L24 42 C24 45,23 46.5,21 48 L13.5 53 L21 58 C23 59.5,24 61,24 64 L24 75 C24 85,24 91,32 91",
  braceRight:
    "M68 15 C76 15,76 21,76 31 L76 42 C76 45,77 46.5,79 48 L86.5 53 L79 58 C77 59.5,76 61,76 64 L76 75 C76 85,76 91,68 91",
  // Fill with fillRule="evenodd" (the windows are knockout subpaths); braces take stroke
  // width 8, butt caps, miter joins.
  tower:
    "M50 13 L58.5 21.5 L58.5 28.5 L50 20 L41.5 28.5 L41.5 21.5 Z M41 31.5 H59 V49 H41 Z M47.25 37.5 H52.75 V43 H47.25 Z M36 53 H64 V70 H36 Z M41.5 58.5 H58.5 V64.5 H41.5 Z M36 74 H64 V91 H36 Z M41.5 79.5 H58.5 V85.5 H41.5 Z",
} as const;

/** Brace stroke width paired with logoPaths (mirrors BRACE_STROKE_WIDTH in Logo/index.tsx). */
export const braceStrokeWidth = 8;

/** VFX-only four-point spark for the summon flash (not part of the brand mark). */
export const sparkFx =
  "M50 38.5 C50.79 46.91,53.09 49.21,61.5 50 C53.09 50.79,50.79 53.09,50 61.5 C49.21 53.09,46.91 50.79,38.5 50 C46.91 49.21,49.21 46.91,50 38.5 Z";
