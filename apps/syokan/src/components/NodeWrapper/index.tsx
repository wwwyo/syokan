import { type ReactNode, useEffect, useState } from "react";
import { navigateToNode, useReveal } from "../../lib/anchor";
import { useActiveTagFilter } from "../../lib/tagFilter";

/**
 * Carrier of the cross-cutting anchor / tag-narrowing mechanisms (UI-state identity
 * is provided per node by Render). display:contents keeps it out of layout so
 * wrapping any node is safe; anchor navigation therefore scrolls to the wrapper's
 * first child box (lib/anchor).
 */
export function NodeWrapper({
  id,
  tags,
  children,
}: {
  id?: string;
  tags?: readonly string[];
  children?: ReactNode;
}) {
  const active = useActiveTagFilter();
  // transient reveal for anchor navigation into a filtered-out node: the filter
  // selection itself must stay untouched, so force-show locally and reset when
  // the selection changes.
  const [forceShown, setForceShown] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset is keyed by selection change
  useEffect(() => {
    setForceShown(false);
  }, [active]);
  const filtered =
    active !== null &&
    tags !== undefined &&
    !tags.some((t) => active.includes(t));
  const hidden = filtered && !forceShown;
  const revealId = useReveal(hidden, () => setForceShown(true));
  return (
    <div
      style={{ display: hidden ? "none" : "contents" }}
      data-node-id={id}
      data-reveal={revealId}
    >
      {children}
    </div>
  );
}

/**
 * In-view anchor link body shared by catalog Link (href="#id"). Rendered as <a>
 * so copy/middle-click degrade sensibly, but navigation happens in-view.
 */
export function AnchorLink({
  nodeId,
  children,
  className,
}: {
  nodeId: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <a
      data-slot="anchor-link"
      href={`#${nodeId}`}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        // reflect the target in the URL (without a native jump) so the link stays
        // shareable / reload-restorable; ViewStateProvider handles it on load
        history.replaceState(null, "", `#${encodeURIComponent(nodeId)}`);
        navigateToNode(nodeId);
      }}
    >
      {children}
    </a>
  );
}
