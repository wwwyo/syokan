import type { ReactElement } from "react";
import type { Item } from "./schema";
import { components } from "./catalogs";
import { NodeWrapper } from "./components/NodeWrapper";
import { UnknownComponent } from "./components/UnknownComponent";
import { hashContent, NodeMetaProvider } from "./lib/viewState";

export type RenderProps = {
  item: Item;
};

export function Render({ item }: RenderProps): ReactElement {
  const Component = components.get(item.type);
  if (!Component) {
    return <UnknownComponent type={item.type} />;
  }
  const childElements = item.children?.map((child, index) => (
    <Render key={child.key ?? index} item={child} />
  ));
  let element = <Component {...item.props}>{childElements}</Component>;
  if (item.id !== undefined || item.tags !== undefined) {
    element = (
      <NodeWrapper id={item.id} tags={item.tags}>
        {element}
      </NodeWrapper>
    );
  }
  // reset per node (own id or null): stateful components must never inherit an
  // ancestor's identity, or siblings under one identified ancestor would share keys
  const meta =
    item.id === undefined ? null : { id: item.id, hash: hashContent(item) };
  return <NodeMetaProvider meta={meta}>{element}</NodeMetaProvider>;
}
