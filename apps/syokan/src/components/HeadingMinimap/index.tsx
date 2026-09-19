import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { pageHeaderBottom } from "../PageLayout/pageHeader";

export type HeadingLevel = 1 | 2 | 3;

export type HeadingEntry = {
  level: HeadingLevel;
  text: string;
  el: Element;
};

const LEVEL_BY_TAG: Record<string, HeadingLevel> = { H1: 1, H2: 2, H3: 3 };

// Below this many visible headings a minimap has nothing to navigate between.
const MIN_HEADINGS = 2;

// Slack for the "scrolled to the very bottom" check: sub-pixel layout rounding can leave
// scrollHeight a fraction short of innerHeight + scrollY even at a hard scroll limit.
const BOTTOM_EPSILON = 2;

// Gap below the sticky header's bottom edge that counts as "reached" — the reading position,
// not the header's raw edge (a heading whose top lines up exactly with the header would
// otherwise flicker between active/inactive on sub-pixel scroll jitter).
const LINE_MARGIN = 8;

// The column's 24px right gutter (max-w-4xl px-6) is spent on the offset from the scrollbar
// (right-2, 8px) + h1's width (the widest tick, 20px) + the button's left padding (pl-0.5, 2px)
// = 30px, 6px over. Left uncorrected on purpose: keeping distance from the scrollbar reads
// better than shaving the tick back down to fit, and a 2px-tall line eating 6px of a narrow-
// viewport line's trailing whitespace is a minor cost. Widening further than this needs the
// gutter itself widened, not just this table.
const TICK_WIDTH: Record<HeadingLevel, string> = {
  1: "w-5",
  2: "w-3.5",
  3: "w-2",
};

/**
 * Turns `[data-slot="heading"]` elements (collected via `querySelectorAll`, so already in
 * document order) into minimap entries. A heading with no client rects — inside a closed
 * Collapsible, or under the ViewPage source-toggle's `hidden` attribute — has no scroll
 * position to track, so it is dropped rather than kept as a phantom tick that can never
 * become active.
 */
export function collectHeadingEntries(
  elements: readonly Element[],
): HeadingEntry[] {
  const entries: HeadingEntry[] = [];
  for (const el of elements) {
    const level = LEVEL_BY_TAG[el.tagName];
    if (!level) continue;
    if (el.getClientRects().length === 0) continue;
    entries.push({ level, text: el.textContent?.trim() ?? "", el });
  }
  return entries;
}

/**
 * Whether a rescan produced the same entries as before: same length, same element identity,
 * same text, same level, in the same order. A `MutationObserver` firing on something that
 * doesn't change the heading list itself — an anchor-flash highlight class toggling on some
 * element inside `page-main`, for instance — would otherwise force a `setHeadings` (and the
 * re-render it causes) on every such mutation.
 */
export function sameHeadings(
  a: readonly HeadingEntry[],
  b: readonly HeadingEntry[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, i) => {
    const other = b[i];
    return (
      other !== undefined &&
      entry.el === other.el &&
      entry.text === other.text &&
      entry.level === other.level
    );
  });
}

/**
 * Which heading is "active" for the current scroll position: the last heading whose top has
 * reached `line` (the reading position just below the sticky header), or the first heading
 * when none has reached it yet (nothing has been read past). `atBottom` overrides this to the
 * last heading once the page is scrolled to its end, so a short trailing section — whose
 * heading top may never line up with `line` because the page runs out of room to scroll
 * further — is not permanently skipped.
 */
export function activeIndex(
  tops: readonly number[],
  line: number,
  atBottom: boolean,
): number {
  if (tops.length === 0) return -1;
  if (atBottom) return tops.length - 1;
  let idx = 0;
  for (const [i, top] of tops.entries()) {
    if (top > line) break;
    idx = i;
  }
  return idx;
}

function referenceLine(): number {
  return pageHeaderBottom() + LINE_MARGIN;
}

function isAtBottom(): boolean {
  const scrollHeight = document.documentElement.scrollHeight;
  return window.innerHeight + window.scrollY >= scrollHeight - BOTTOM_EPSILON;
}

function scrollToHeading(el: Element) {
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  // pageHeaderBottom() returns a viewport y (the header's bottom edge), not a height, but it is
  // the height here: the header is `sticky top-0` at the very top of the column, so its bottom
  // edge's viewport y and its own height are the same number.
  const headerHeight = pageHeaderBottom();
  const top =
    el.getBoundingClientRect().top + window.scrollY - headerHeight - LINE_MARGIN;
  window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
}

/**
 * Right-edge minimap TOC for a snapshot page: one tick per rendered `Heading`, highlighting the
 * current section as the reader scrolls (scrollspy), expanding to a text list on
 * hover/focus/tap. Clicking an item scrolls to that heading.
 *
 * Viewer chrome, not a catalog node: headings are read from the rendered DOM instead of props,
 * because only `Heading` (catalog) ever emits `[data-slot="heading"]` and no LLM posts this
 * component. The DOM it reads can change without a re-post — TreeDoc live-sync swaps a subtree,
 * Collapsible toggles open/closed, ViewPage's source toggle hides the body — so a
 * MutationObserver keeps the heading list in sync instead of collecting once at mount.
 * `PageLayout`'s non-fullBleed branch mounts this unconditionally; it renders nothing until
 * enough headings are visible.
 */
export function HeadingMinimap() {
  const [headings, setHeadings] = useState<HeadingEntry[]>([]);
  const [active, setActive] = useState(-1);
  const [expanded, setExpanded] = useState(false);
  const headingsRef = useRef<HeadingEntry[]>([]);
  const rafRef = useRef<number | null>(null);
  // Set by a scroll/resize/mutation callback that fires while a frame is already pending, so
  // the coalesced frame still does the more expensive rescan instead of silently downgrading
  // to a plain position update (see `schedule` below).
  const needsRescanRef = useRef(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  // Resolved once per mount by the effect below; rescan() reads it instead of re-querying, since
  // page-main doesn't change identity for the component's lifetime (a route change remounts).
  const mainRef = useRef<Element | null>(null);

  const updatePosition = useCallback(() => {
    const entries = headingsRef.current;
    if (entries.length === 0) {
      setActive(-1);
      return;
    }
    const line = referenceLine();
    const tops = entries.map((e) => e.el.getBoundingClientRect().top);
    setActive(activeIndex(tops, line, isAtBottom()));
  }, []);

  const rescan = useCallback(() => {
    const main = mainRef.current;
    const nodes = main
      ? Array.from(main.querySelectorAll('[data-slot="heading"]'))
      : [];
    const entries = collectHeadingEntries(nodes);
    // Skip the setHeadings re-render when the list itself hasn't changed (e.g. a
    // MutationObserver firing on an unrelated attribute mutation inside page-main); the
    // active tick still needs recomputing below, since content around a heading can move
    // without the heading list changing.
    if (!sameHeadings(headingsRef.current, entries)) {
      headingsRef.current = entries;
      setHeadings(entries);
    }
    updatePosition();
  }, [updatePosition]);

  // Coalesces scroll/resize/mutation bursts to at most one measurement per rendering frame.
  // A rescan request that arrives while a frame is already pending must still be honored in
  // that frame — dropping it silently (the previous shared-rafRef design) would leave a stale
  // heading list after a mutation that happens to land mid-scroll.
  const schedule = useCallback(
    (rescanRequested: boolean) => {
      if (rescanRequested) needsRescanRef.current = true;
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const doRescan = needsRescanRef.current;
        needsRescanRef.current = false;
        if (doRescan) rescan();
        else updatePosition();
      });
    },
    [rescan, updatePosition],
  );

  useEffect(() => {
    const main = document.querySelector('[data-slot="page-main"]');
    mainRef.current = main;
    rescan();

    const onScrollOrResize = () => schedule(false);
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });

    const observer = new MutationObserver(() => schedule(true));
    if (main) {
      observer.observe(main, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["hidden", "class", "style"],
      });
    }

    return () => {
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      observer.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        // Reset, not just cancel: a remount (StrictMode, a story swap) that unmounts while a
        // frame is pending would otherwise leave this ref permanently non-null, and every
        // future `schedule` call on the new instance would see it as "already pending" and
        // early-return forever — the bug that made scrollspy never update past the initial scan.
        rafRef.current = null;
      }
      needsRescanRef.current = false;
    };
  }, [rescan, schedule]);

  useEffect(() => {
    if (!expanded) return;
    // Touch devices have no hover, so the panel is closed by tapping outside it instead.
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node | null)) {
        setExpanded(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [expanded]);

  if (headings.length < MIN_HEADINGS) return null;

  return (
    // Zero-height sticky wrapper: pins the tick column to the vertical center of the viewport
    // as the page scrolls, without taking up flow space in PageLayout's column. Positioned
    // relative to the page column (PageLayout's full width, to the right of AppSidebar — not
    // the max-w-4xl text column `right-2` below sits at the far edge of), not the viewport, so
    // it tracks the page column's right edge instead of the viewport's — the page column can
    // sit short of the viewport's right edge (e.g. a resizable Stack pane), and a viewport-fixed
    // position would drift away from the content it annotates in that case.
    // z-10 stays under page-header's z-20.
    <div
      data-slot="heading-minimap"
      className="pointer-events-none sticky top-1/2 z-10 h-0"
    >
      <div
        ref={wrapperRef}
        // row-reverse (not swapping DOM order) so Tab order stays tick-button-then-panel-item
        // while the panel visually opens to the button's left, not its right.
        // right-2: 8px clear of the column's scrollbar, not flush against it — see TICK_WIDTH
        // for the gutter-width trade-off this offset costs.
        className="pointer-events-auto absolute right-2 top-1/2 flex -translate-y-1/2 flex-row-reverse items-center"
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        onFocus={() => setExpanded(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setExpanded(false);
          }
        }}
      >
        <button
          type="button"
          aria-label={t.headingMinimap.label}
          aria-expanded={expanded}
          // Open-only: a toggle here reopens-then-immediately-closes on desktop, because
          // mouseenter already opened the panel by the time the click lands. Closing is
          // handled by mouseleave/blur/an item selection/an outside tap instead — the last of
          // which is also how a touch tap (which has no hover) closes it again.
          onClick={() => setExpanded(true)}
          // items-end: ticks (variable width by level) flush to the shared right edge that
          // sits against the wrapper's right-2 offset, instead of flush to their own varying
          // left edges. No right padding: the offset on the wrapper already provides the gap
          // to the scrollbar, so pr-0 avoids doubling it (see TICK_WIDTH for the total cost).
          className="flex flex-col items-end gap-2 rounded-l-md py-3 pl-0.5 pr-0"
        >
          {headings.map((h, i) => (
            <span
              // No stable id on a Heading node; document order is stable across a rescan
              // (headings only ever change contents in place, not shuffle among themselves).
              key={i}
              aria-hidden="true"
              className={cn(
                "h-[2px] rounded-full transition-colors",
                TICK_WIDTH[h.level],
                i === active ? "bg-foreground" : "bg-muted-foreground/40",
              )}
            />
          ))}
        </button>
        {expanded ? (
          <nav
            aria-label={t.headingMinimap.label}
            className="mr-1 max-h-[60vh] max-w-64 overflow-y-auto rounded-md border bg-popover p-1.5 text-popover-foreground shadow-md"
          >
            {headings.map((h, i) => (
              <button
                key={i}
                type="button"
                aria-current={i === active ? "location" : undefined}
                onClick={() => {
                  scrollToHeading(h.el);
                  setExpanded(false);
                }}
                style={{ paddingLeft: `${(h.level - 1) * 0.75 + 0.5}rem` }}
                className={cn(
                  "block w-full truncate rounded px-2 py-1 text-left text-sm",
                  i === active
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {h.text}
              </button>
            ))}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
