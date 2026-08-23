import { cn } from "../../lib/utils";

/**
 * syokan's brand mark: `{ 塔 }`. The two braces are the JSON incantation an LLM speaks —
 * syokan's only input — and the tower rising inside them (roof chevron + stacked blocks with
 * knocked-out windows) is the structured view that materializes. The mark literally reads
 * "JSON summons a structure". The single color is left to currentColor, so it follows the
 * surrounding text color (= --foreground) as-is.
 *
 * Geometry lives in the constants below so the shape has one definition. The favicon in
 * index.html is a deliberate bold twin (thicker brace stroke + larger knockouts so it stays
 * legible at 16px); keep the two in sync by eye. apps/demo-video/src/theme.ts carries a copy
 * for Remotion — update it together with this file.
 */
export const BRACE_LEFT =
  "M32 15 C24 15,24 21,24 31 L24 42 C24 45,23 46.5,21 48 L13.5 53 L21 58 C23 59.5,24 61,24 64 L24 75 C24 85,24 91,32 91";
export const BRACE_RIGHT =
  "M68 15 C76 15,76 21,76 31 L76 42 C76 45,77 46.5,79 48 L86.5 53 L79 58 C77 59.5,76 61,76 64 L76 75 C76 85,76 91,68 91";
// One path, evenodd: outer boxes cut by their window subpaths. Top to bottom: roof chevron
// (vertical-cut ends), shrine block + square window, two wide blocks + slot windows.
export const TOWER =
  "M50 13 L58.5 21.5 L58.5 28.5 L50 20 L41.5 28.5 L41.5 21.5 Z " +
  "M41 31.5 H59 V49 H41 Z M47.25 37.5 H52.75 V43 H47.25 Z " +
  "M36 53 H64 V70 H36 Z M41.5 58.5 H58.5 V64.5 H41.5 Z " +
  "M36 74 H64 V91 H36 Z M41.5 79.5 H58.5 V85.5 H41.5 Z";
/** Brace stroke width shared with the lockup so the mark reads identically in both. */
export const BRACE_STROKE_WIDTH = 8;
// Tight bounds of the braces+tower (with stroke and miter tips), for the lockup where the
// square padding would otherwise open an ugly gap to the wordmark.
export const SIGIL_VIEWBOX_TIGHT = "8.5 11 83 84";

type LogoProps = {
  /** Accessible name. For decorative use (e.g. a wordmark sits beside it), pass "" to aria-hide. */
  title?: string;
  /** Trace the braces on, then pop the tower — a "summon" reveal for empty/loading states. */
  animated?: boolean;
  className?: string;
};

export function Logo({ title = "syokan", animated = false, className }: LogoProps) {
  const decorative = title === "";
  const pathLength = animated ? 100 : undefined;
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("size-6 text-foreground", animated && "summon-draw", className)}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative || undefined}
      fill="none"
      stroke="currentColor"
      strokeWidth={BRACE_STROKE_WIDTH}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={BRACE_LEFT} pathLength={pathLength} />
      <path d={BRACE_RIGHT} pathLength={pathLength} />
      <path className="summon-tower" d={TOWER} fill="currentColor" fillRule="evenodd" stroke="none" />
    </svg>
  );
}
