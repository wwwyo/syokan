import type { ReactElement } from "react";
import type { Item } from "./schema";
import { components } from "./catalogs";
import { NodeWrapper } from "./components/NodeWrapper";
import { UnknownComponent } from "./components/UnknownComponent";

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
  const element = <Component {...item.props}>{childElements}</Component>;
  if (item.id === undefined && item.tags === undefined) return element;
  return <NodeWrapper item={item}>{element}</NodeWrapper>;
}
