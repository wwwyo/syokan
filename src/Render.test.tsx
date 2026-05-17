import { describe, expect, test } from "bun:test";
import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import type { Item } from "@/schema";
import { Render } from "./Render";
import { Page } from "./components/Page";
import { Section } from "./components/Section";
import { UnknownComponent } from "./components/UnknownComponent";

describe("Render", () => {
  test("maps a Page item to the Page component with props passed through", () => {
    const item: Item = { type: "Page", props: { title: "Hello" } };
    const element = Render({ item });
    expect(element.type).toBe(Page);
    expect((element.props as { title?: string }).title).toBe("Hello");
  });

  test("maps a Section item to the Section component with props passed through", () => {
    const item: Item = { type: "Section", props: { heading: "Intro" } };
    const element = Render({ item });
    expect(element.type).toBe(Section);
    expect((element.props as { heading?: string }).heading).toBe("Intro");
  });

  test("unknown type renders UnknownComponent and the type name is visible", () => {
    const item: Item = { type: "MissingType", props: {} };
    const element = Render({ item });
    expect(element.type).toBe(UnknownComponent);
    expect((element.props as { type: string }).type).toBe("MissingType");

    const html = renderToString(createElement(Render, { item }));
    expect(html).toContain("MissingType");
    expect(html).toContain("Unknown component type");
  });

  test("Page children are recursively wrapped in Render elements", () => {
    const item: Item = {
      type: "Page",
      props: {},
      children: [
        { type: "Section", props: { heading: "A" } },
        { type: "Section", props: { heading: "B" } },
      ],
    };
    const element = Render({ item });
    expect(element.type).toBe(Page);

    const rendered = (element.props as { children?: ReactElement[] }).children;
    expect(rendered).toBeDefined();
    expect(rendered).toHaveLength(2);
    expect(rendered?.[0]?.type).toBe(Render);
    expect(rendered?.[1]?.type).toBe(Render);
    expect((rendered?.[0]?.props as { item: Item }).item.type).toBe("Section");
  });

  test("nested children render recursively into a single HTML string", () => {
    const item: Item = {
      type: "Page",
      props: { title: "Top" },
      children: [
        {
          type: "Section",
          props: { heading: "Outer" },
          children: [
            { type: "Section", props: { heading: "Inner" } },
          ],
        },
      ],
    };
    const html = renderToString(createElement(Render, { item }));
    expect(html).toContain("Top");
    expect(html).toContain("Outer");
    expect(html).toContain("Inner");
  });

  test("children: undefined is handled (no children prop emitted to component)", () => {
    const item: Item = { type: "Section", props: { heading: "lonely" } };
    const element = Render({ item });
    expect(element.type).toBe(Section);
    expect((element.props as { children?: unknown }).children).toBeUndefined();
  });

  test("unknown type with siblings still surfaces only the unknown type's name", () => {
    const item: Item = { type: "Page", props: {}, children: [{ type: "Nope", props: {} }] };
    const html = renderToString(createElement(Render, { item }));
    expect(html).toContain("Nope");
  });
});
