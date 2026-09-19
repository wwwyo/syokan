// PageLayout owns the `[data-slot="page-header"]` contract (the sticky header it renders in its
// non-fullBleed branch); readers of that contract (useResizeScrollAnchor, HeadingMinimap) go
// through this single helper instead of each re-querying the selector, so the contract has one
// place to change.

/**
 * The viewport y-coordinate of the sticky page header's bottom edge, or 0 when there is no
 * header (fullBleed, or a route with none). Callers add their own margin on top of this raw
 * edge; how much clearance a reference line or a scroll-to-heading offset needs is a caller
 * concern, not this contract's.
 */
export function pageHeaderBottom(): number {
  const header = document.querySelector('[data-slot="page-header"]');
  return header?.getBoundingClientRect().bottom ?? 0;
}
