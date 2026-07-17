import { type RefObject, useEffect, useRef } from "react";

type Anchor = {
  el: Element;
  // Distance from the reference line at record time, reapplied at correction time.
  offset: number;
};

// x candidates as fractions of page-main's own horizontal span, tried in order until one lands
// inside it (a single midpoint probe can miss into the gap between two block-level siblings).
// Viewport-based x would fall into the push sidebar on narrow viewports.
const X_FRACTIONS = [0.5, 0.25, 0.75];

// The reference line must clear the sticky header, otherwise elementFromPoint keeps hitting
// header content instead of the body. Read from the header's actual rect rather than a fixed
// pixel guess, since header height differs per route (ViewHeader vs none).
function referenceY(): number {
  const header = document.querySelector('[data-slot="page-header"]');
  return (header?.getBoundingClientRect().bottom ?? 0) + 1;
}

function findAnchor(): Anchor | null {
  const main = document.querySelector('[data-slot="page-main"]');
  if (!main) return null;
  const refY = referenceY();
  const { left, width } = main.getBoundingClientRect();
  for (const fraction of X_FRACTIONS) {
    const el = document.elementFromPoint(left + width * fraction, refY);
    if (!el || el === document.documentElement || el === document.body) {
      continue;
    }
    if (!el.closest('[data-slot="page-main"]')) continue;
    return { el, offset: el.getBoundingClientRect().top - refY };
  }
  return null;
}

/**
 * Keeps the reading position stable across content-column width changes that reflow body
 * content and shift its pixel height. Tracks which element sits on a reference line near the
 * viewport top, then on width change scrolls by however far that element moved.
 *
 * Returns a ref the caller attaches to the resident content column. Observing that element's
 * width — not the window — covers window resize and the sidebar toggle in one path (the toggle
 * reflows the column without changing window.innerWidth, so a resize listener would miss it).
 * The sidebar animates its width, so the observer fires per frame during the transition and the
 * anchor is corrected continuously. Height-only observer callbacks (e.g. mobile URL bar) are
 * ignored — only width changes reflow this layout's single-column content. scrollBy never
 * resizes the observed element, so no observer feedback loop is possible.
 *
 * Native CSS scroll anchoring can't cover this: the spec suppresses anchoring when elements on
 * the anchor-to-scroller path change width/height computed values — exactly what a width reflow
 * does.
 */
export function useResizeScrollAnchor(): RefObject<HTMLDivElement | null> {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<Anchor | null>(null);
  // null until the observer's guaranteed initial callback records the baseline width.
  const widthRef = useRef<number | null>(null);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    anchorRef.current = findAnchor();

    // The corrective scrollBy fires its scroll event one frame later — after an animated width
    // change has advanced again — so re-recording from it bakes that frame's uncorrected
    // displacement into the anchor, and the error compounds across the sidebar transition.
    // Skip by matching the expected post-correction scrollY, not a boolean: scroll events
    // coalesce, so a genuine scroll merged into the same event must still be recorded (it
    // shows up as a scrollY mismatch), or the anchor goes stale.
    let expectedScrollY: number | null = null;

    // No throttle: scroll events are already coalesced to one per rendering frame by spec.
    const recordAnchor = () => {
      const skip = expectedScrollY !== null && window.scrollY === expectedScrollY;
      expectedScrollY = null;
      if (skip) return;
      anchorRef.current = findAnchor();
    };

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width === undefined || width === widthRef.current) return;
      const isInitial = widthRef.current === null;
      widthRef.current = width;
      // observe() always fires once immediately; correcting then would scroll on plain mount.
      if (isInitial) return;

      const anchor = anchorRef.current;
      if (!anchor || !anchor.el.isConnected) {
        // The anchor can vanish without a scroll event (route transition at the same scrollY,
        // TreeDoc re-sync swapping the DOM). Re-arm here so the next width change corrects.
        anchorRef.current = findAnchor();
        return;
      }
      const refY = referenceY();
      const before = window.scrollY;
      window.scrollBy(
        0,
        anchor.el.getBoundingClientRect().top - refY - anchor.offset,
      );
      // A zero-delta (or edge-clamped) scrollBy emits no event; arming the skip would swallow
      // a genuine user scroll instead.
      if (window.scrollY !== before) expectedScrollY = window.scrollY;
    });
    observer.observe(target);
    window.addEventListener("scroll", recordAnchor, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", recordAnchor);
    };
  }, []);

  return targetRef;
}
