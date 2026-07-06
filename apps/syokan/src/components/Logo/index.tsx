import { cn } from "../../lib/utils";

/**
 * syokan's brand mark: `{ ✦ }`. The two braces are the JSON incantation an LLM speaks —
 * syokan's only input — and the four-point spark is the view that materializes inside it.
 * The mark literally reads "JSON becomes magic": structured data summoned into a living
 * view. The single color is left to currentColor, so it follows the surrounding text color
 * (= --foreground) as-is.
 *
 * Geometry lives in the constants below so the shape has one definition. The favicon in
 * index.html is a deliberate bold twin (thicker stroke so the thin brace curves stay legible
 * at 16px); keep the two in sync by eye.
 */
export const BRACE_LEFT =
  "M34 23 C27 23,27 29,27 39 C27 45,23 47,18 50 C23 53,27 55,27 61 C27 71,27 77,34 77";
export const BRACE_RIGHT =
  "M66 23 C73 23,73 29,73 39 C73 45,77 47,82 50 C77 53,73 55,73 61 C73 71,73 77,66 77";
export const SPARK =
  "M50 38.5 C50.79 46.91,53.09 49.21,61.5 50 C53.09 50.79,50.79 53.09,50 61.5 C49.21 53.09,46.91 50.79,38.5 50 C46.91 49.21,49.21 46.91,50 38.5 Z";
// Tight bounds of the braces+spark (with stroke), for the lockup where the square padding
// would otherwise open an ugly gap to the wordmark.
export const SIGIL_VIEWBOX_TIGHT = "16 21 68 58";

type LogoProps = {
  /** Accessible name. For decorative use (e.g. a wordmark sits beside it), pass "" to aria-hide. */
  title?: string;
  /** Trace the braces on, then pop the spark — a "summon" reveal for empty/loading states. */
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
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={BRACE_LEFT} pathLength={pathLength} />
      <path d={BRACE_RIGHT} pathLength={pathLength} />
      <path className="summon-spark" d={SPARK} fill="currentColor" stroke="none" />
    </svg>
  );
}
