import type { ReactElement } from "react";
import type { Item } from "./schema";
import { components } from "./catalogs";
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
  return <Component {...item.props}>{childElements}</Component>;
}
