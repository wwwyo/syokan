import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { navigateToNode, registerReveal } from "../../lib/anchor";
import { useActiveTagFilter } from "../../lib/tagFilter";
import { hashContent, NodeMetaProvider } from "../../lib/viewState";
import type { Item } from "../../schema";

/**
 * Carrier of the cross-cutting node mechanisms (anchor id / tag narrowing / UI state
 * identity). display:contents keeps it out of layout so wrapping any node is safe;
 * anchor navigation therefore scrolls to the wrapper's first child box (lib/anchor).
 */
export function NodeWrapper({
  item,
  children,
}: {
  item: Item;
  children?: ReactNode;
}) {
  const { id, tags } = item;
  // state identity = (id, content hash): changed content must not inherit old marks
  const meta = useMemo(
    () => (id === undefined ? null : { id, hash: hashContent(item) }),
    [id, item],
  );
  const body =
    meta === null ? (
      children
    ) : (
      <NodeMetaProvider meta={meta}>{children}</NodeMetaProvider>
    );
  return (
    <FilterableWrapper id={id} tags={tags}>
      {body}
    </FilterableWrapper>
  );
}

function FilterableWrapper({
  id,
  tags,
  children,
}: {
  id?: string;
  tags?: readonly string[];
  children?: ReactNode;
}) {
  const active = useActiveTagFilter();
  const uid = useId();
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
  useEffect(() => {
    if (!hidden) return;
    return registerReveal(uid, () => setForceShown(true));
  }, [hidden, uid]);
  return (
    <div
      style={{ display: hidden ? "none" : "contents" }}
      data-node-id={id}
      data-reveal={hidden ? uid : undefined}
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
        navigateToNode(nodeId);
      }}
    >
      {children}
    </a>
  );
}
