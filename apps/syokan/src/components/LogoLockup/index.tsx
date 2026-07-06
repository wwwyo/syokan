import { BRACE_LEFT, BRACE_RIGHT, SIGIL_VIEWBOX_TIGHT, SPARK } from "../Logo";
import { cn } from "../../lib/utils";

/**
 * The brand lockup: the `{ ✦ }` mark set with the lowercase "syokan" wordmark in Grenze
 * Gotisch (a gothic blackletter that reads incantation-like). The mark uses a tight viewBox
 * so it sits flush against the wordmark instead of floating inside the square icon padding.
 * Both mark and text follow currentColor; size the whole thing with font-size (via className).
 */
type LogoLockupProps = {
  /** Accessible name. For decorative use (e.g. another element labels the region), pass "" to aria-hide. */
  title?: string;
  className?: string;
};

export function LogoLockup({ title = "syokan", className }: LogoLockupProps) {
  const decorative = title === "";
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative || undefined}
      className={cn(
        "font-brand inline-flex items-center gap-[0.36em] leading-none tracking-[0.02em]",
        className,
      )}
    >
      <svg
        viewBox={SIGIL_VIEWBOX_TIGHT}
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        // ~1.2x the wordmark's small-cap ink height (measured 0.636em) so the mark reads as
        // an emblem sitting with the letters, not towering over them
        className="h-[0.78em] w-auto"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d={BRACE_LEFT} />
        <path d={BRACE_RIGHT} />
        <path d={SPARK} fill="currentColor" stroke="none" />
      </svg>
      <span aria-hidden="true">syokan</span>
    </span>
  );
}
