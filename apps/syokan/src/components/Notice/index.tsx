import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

type NoticeProps = {
  /**
   * The `data-slot` value. Owned by the caller rather than derived here, because the
   * existing slot names (`tree-doc-error`, `mermaid-error`) are what tests and outside
   * selectors match on — a shared name would break them and lose the "which component
   * failed" distinction.
   */
  slot: string;
  /**
   * Outer margin. Deliberately not defaulted: a notice that stands alone needs its own
   * vertical rhythm (`my-4`), while one stacked directly above the content it explains
   * only needs the gap below it (`mb-2`).
   */
  className?: string;
  children: ReactNode;
};

/**
 * The muted box that explains a recoverable failure. Recoverable means the content is
 * still usable — stale, or shown in a raw fallback — so this reads as a note, not an
 * alarm. A render failure with nothing left to show uses the destructive variant in
 * `ErrorBoundary` instead; the two tones are the signal, so do not merge them.
 */
export function Notice({ slot, className, children }: NoticeProps) {
  return (
    <div
      data-slot={slot}
      className={cn(
        "rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

type NoticeDetailProps = {
  /**
   * How to handle content too wide for the box.
   * - `break`: wrap at any character. For a long path, which has no useful break points.
   * - `preserve`: keep whitespace and scroll. For text whose columns carry meaning, such
   *   as a caret line pointing at an offending token — wrapping misaligns the caret.
   */
  wrap: "break" | "preserve";
  children: ReactNode;
};

/** The small monospace supporting line under a {@link Notice} message. */
export function NoticeDetail({ wrap, children }: NoticeDetailProps) {
  const base = "mt-1 font-mono text-xs opacity-70";
  return wrap === "preserve" ? (
    <pre className={cn(base, "overflow-x-auto")}>{children}</pre>
  ) : (
    <p className={cn(base, "break-all")}>{children}</p>
  );
}
