import type { ReactNode } from "react";
import { navigateToNode } from "../../lib/anchor";

/**
 * Carrier of the cross-cutting anchor mechanism (UI-state identity is provided per
 * node by Render). display:contents keeps it out of layout so wrapping any node is
 * safe; anchor navigation therefore scrolls to the wrapper's first child box
 * (lib/anchor).
 */
export function NodeWrapper({
  id,
  children,
}: {
  id?: string;
  children?: ReactNode;
}) {
  return (
    <div style={{ display: "contents" }} data-node-id={id}>
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
