import { describe, expect, test } from "bun:test";
import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import type { Item } from "./schema";
import { Heading } from "./catalogs/Heading";
import { Stack } from "./catalogs/Stack";
import { UnknownComponent } from "./components/UnknownComponent";
import { Render } from "./Render";

// Render wraps every node in a NodeMetaProvider (per-node UI-state identity reset);
// unwrap it to reach the component element in structural assertions.
function unwrap(element: ReactElement): ReactElement {
  return (element.props as { children: ReactElement }).children;
}

describe("Render", () => {
  test("maps a Heading item to the Heading component with props passed through", () => {
    const item: Item = { type: "Heading", props: { text: "Hello" } };
    const element = unwrap(Render({ item }));
    expect(element.type).toBe(Heading);
    expect((element.props as { text?: string }).text).toBe("Hello");
  });

  test("maps a Stack item to the Stack component with props passed through", () => {
    const item: Item = { type: "Stack", props: { direction: "horizontal" } };
    const element = unwrap(Render({ item }));
    expect(element.type).toBe(Stack);
    expect((element.props as { direction?: string }).direction).toBe(
      "horizontal",
    );
  });

  test("unknown type renders UnknownComponent and the type name is visible", () => {
    const item: Item = { type: "MissingType", props: {} };
    const element = unwrap(Render({ item }));
    expect(element.type).toBe(UnknownComponent);
    expect((element.props as { type: string }).type).toBe("MissingType");

    const html = renderToString(createElement(Render, { item }));
    expect(html).toContain("MissingType");
    expect(html).toContain("Unknown component type");
  });

  test("a node carrying id/tags renders through NodeWrapper with a data-node-id anchor", () => {
    const item: Item = {
      type: "Text",
      props: { body: "anchored" },
      id: "risk-1",
      tags: ["High"],
    };
    const html = renderToString(createElement(Render, { item }));
    expect(html).toContain('data-node-id="risk-1"');
    expect(html).toContain("anchored");
  });

  test("an unknown-type node with an id still renders a data-node-id anchor", () => {
    const item: Item = { type: "MissingType", props: {}, id: "ghost" };
    const html = renderToString(createElement(Render, { item }));
    expect(html).toContain('data-node-id="ghost"');
  });

  test("Stack children are recursively wrapped in Render elements", () => {
    const item: Item = {
      type: "Stack",
      props: {},
      children: [
        { type: "Heading", props: { text: "A" } },
        { type: "Heading", props: { text: "B" } },
      ],
    };
    const element = unwrap(Render({ item }));
    expect(element.type).toBe(Stack);

    const rendered = (element.props as { children?: ReactElement[] }).children;
    expect(rendered).toBeDefined();
    expect(rendered).toHaveLength(2);
    expect(rendered?.[0]?.type).toBe(Render);
    expect(rendered?.[1]?.type).toBe(Render);
    expect((rendered?.[0]?.props as { item: Item }).item.type).toBe("Heading");
  });

  test("nested children render recursively into a single HTML string", () => {
    const item: Item = {
      type: "Stack",
      props: {},
      children: [
        {
          type: "Card",
          props: {},
          children: [{ type: "Heading", props: { text: "Inner" } }],
        },
      ],
    };
    const html = renderToString(createElement(Render, { item }));
    expect(html).toContain("Inner");
  });

  test("children: undefined is handled (no children prop emitted to component)", () => {
    const item: Item = { type: "Heading", props: { text: "lonely" } };
    const element = unwrap(Render({ item }));
    expect(element.type).toBe(Heading);
    expect((element.props as { children?: unknown }).children).toBeUndefined();
  });

  test("unknown type with siblings still surfaces only the unknown type's name", () => {
    const item: Item = {
      type: "Stack",
      props: {},
      children: [{ type: "Nope", props: {} }],
    };
    const html = renderToString(createElement(Render, { item }));
    expect(html).toContain("Nope");
  });

  test("uses item.key as React key for children when provided, falls back to index otherwise", () => {
    const item: Item = {
      type: "Stack",
      props: {},
      children: [
        { type: "Heading", props: { text: "A" }, key: "intro" },
        { type: "Heading", props: { text: "B" } },
      ],
    };
    const element = unwrap(Render({ item }));
    const rendered = (element.props as { children?: ReactElement[] }).children;
    expect(rendered).toBeDefined();
    expect(rendered).toHaveLength(2);
    expect(rendered?.[0]?.key).toBe("intro");
    expect(rendered?.[1]?.key).toBe("1");
  });
});
