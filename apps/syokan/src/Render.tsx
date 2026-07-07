import type { ReactElement } from "react";
import type { Item } from "./schema";
import { components } from "./catalogs";
import { NodeWrapper } from "./components/NodeWrapper";
import { UnknownComponent } from "./components/UnknownComponent";
import { type NodeMeta, NodeMetaProvider, hashContent } from "./lib/viewState";

export type RenderProps = {
  item: Item;
};

// Cache the UI-state identity per item object. Item refs are stable across re-renders
// (they come from the parsed envelope), so the whole-subtree stringify in hashContent
// runs once per node instead of on every interactive re-render. Not a hook, so Render
// stays a plain recursive function.
const metaCache = new WeakMap<Item, NodeMeta | null>();

function nodeMeta(item: Item): NodeMeta | null {
  const cached = metaCache.get(item);
  if (cached !== undefined) return cached;
  const meta = item.id === undefined ? null : { id: item.id, hash: hashContent(item) };
  metaCache.set(item, meta);
  return meta;
}

export function Render({ item }: RenderProps): ReactElement {
  const Component = components.get(item.type);
  const childElements = item.children?.map((child, index) => (
    <Render key={child.key ?? index} item={child} />
  ));
  let element = Component ? (
    <Component {...item.props}>{childElements}</Component>
  ) : (
    <UnknownComponent type={item.type} />
  );
  // id / tags apply to any node (an anchor target must exist even for an unknown type,
  // or a #id Link would silently fail to navigate)
  if (item.id !== undefined || item.tags !== undefined) {
    element = (
      <NodeWrapper id={item.id} tags={item.tags}>
        {element}
      </NodeWrapper>
    );
  }
  // reset per node (own id or null): stateful components must never inherit an
  // ancestor's identity, or siblings under one identified ancestor would share keys
  return <NodeMetaProvider meta={nodeMeta(item)}>{element}</NodeMetaProvider>;
}
