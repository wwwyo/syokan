import { BRACE_LEFT, BRACE_RIGHT, SIGIL_VIEWBOX_TIGHT, SPARK } from "../Logo";
import { cn } from "../../lib/utils";

/**
 * The brand lockup: the `{ ✦ }` mark set flush against the lowercase "syokan" wordmark in
 * Cormorant — a sharp, high-contrast display serif whose thin strokes echo the thin mark. The
 * mark uses a tight viewBox so it sits against the word instead of floating in the square icon
 * padding. Both mark and text follow currentColor; size the whole thing with font-size.
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
        "font-brand inline-flex items-center gap-[0.26em] leading-none tracking-tight",
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
        // ~cap height so the mark sits with the letters rather than towering over them
        className="h-[0.82em] w-auto"
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
