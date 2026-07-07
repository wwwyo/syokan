// Contract between the TagFilter catalog container (provides the selection) and the
// node wrappers rendered by Render (hide themselves when their tags don't match).
// Narrowing is a cross-cutting mechanism: individual types (Table etc.) never filter.

import { createContext, useContext } from "react";

export const TagFilterContext = createContext<readonly string[] | null>(null);

/** Active tag selection, or null when no narrowing applies at this position. */
export function useActiveTagFilter(): readonly string[] | null {
  const active = useContext(TagFilterContext);
  if (active === null || active.length === 0) return null;
  return active;
}
