import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Render } from "../../Render";
import { Stack, type StackProps, stackPropsSchema } from ".";

// Stack reads the nesting depth from context, so it has to be rendered rather than called.
function render(props: StackProps) {
  return renderToString(createElement(Stack, props));
}

/** classNames of every data-slot="stack", outermost first. */
function stackClasses(html: string) {
  return [
    ...html.matchAll(/<div [^>]*data-slot="stack"[^>]*class="([^"]*)"/g),
  ].map((m) => m[1] ?? "");
}

/** className of the outermost data-slot="stack" in the markup. */
function outerStackClass(html: string) {
  return stackClasses(html)[0] ?? "";
}

describe("stackPropsSchema", () => {
  test("gap is optional and limited to the scale", () => {
    expect(stackPropsSchema.safeParse({}).success).toBe(true);
    expect(stackPropsSchema.safeParse({ gap: "sm" }).success).toBe(true);
    expect(stackPropsSchema.safeParse({ gap: "8" }).success).toBe(false);
    expect(stackPropsSchema.safeParse({ gap: 8 }).success).toBe(false);
  });
});

describe("Stack", () => {
  test("defaults to a plain vertical flex stack", () => {
    expect(outerStackClass(render({ children: null }))).toContain("flex-col");
  });

  test("horizontal direction switches to flex-row and scrolls instead of bursting", () => {
    const cls = outerStackClass(render({ direction: "horizontal" }));
    expect(cls).toContain("flex-row");
    expect(cls).toContain("overflow-x-auto");
  });

  test("gap tightens with each level of nesting", () => {
    const html = render({
      children: createElement(Stack, {
        children: createElement(Stack, { children: null }),
      }),
    });
    expect(stackClasses(html).map((c) => c.match(/gap-\d+/)?.[0])).toEqual([
      "gap-8",
      "gap-4",
      "gap-2",
    ]);
  });

  test("depth past the scale clamps to the tightest gap", () => {
    const html = render({
      children: createElement(Stack, {
        children: createElement(Stack, {
          children: createElement(Stack, { children: null }),
        }),
      }),
    });
    expect(stackClasses(html).at(-1)).toContain("gap-2");
  });

  test("an explicit gap wins over the depth default", () => {
    const html = render({ gap: "none", children: null });
    expect(outerStackClass(html)).toContain("gap-0");
  });

  test("an explicit gap does not change the depth its children see", () => {
    const html = render({
      gap: "none",
      children: createElement(Stack, { children: null }),
    });
    expect(stackClasses(html).at(-1)).toContain("gap-4");
  });

  test("resizable=true renders a panel group whose handles replace the gap", () => {
    const html = render({
      resizable: true,
      direction: "horizontal",
      children: [
        createElement("p", { key: "a" }, "a"),
        createElement("p", { key: "b" }, "b"),
      ],
    });
    expect(html).toContain('data-slot="resizable-panel-group"');
    expect(html).toContain('data-slot="resizable-handle"');
    expect(html).not.toContain('data-slot="stack"');
  });

  test("a stack inside a resizable panel still counts as nested", () => {
    const html = render({
      resizable: true,
      children: createElement(Stack, { children: null }),
    });
    expect(outerStackClass(html)).toContain("gap-4");
  });

  // Render is the path real snapshots take. Testing Stack alone would not catch a change there
  // (how children are built, what wrappers are inserted) resetting the depth.
  test("depth survives the recursive Render and an intervening Card", () => {
    const html = renderToString(
      createElement(Render, {
        item: {
          type: "Stack",
          props: {},
          children: [
            {
              type: "Card",
              props: { title: "group" },
              children: [{ type: "Stack", props: {}, children: [] }],
            },
          ],
        },
      }),
    );
    expect(stackClasses(html).map((c) => c.match(/gap-\d+/)?.[0])).toEqual([
      "gap-8",
      "gap-4",
    ]);
  });

  test("vertical resizable gets a minimum height so panels do not collapse", () => {
    expect(render({ resizable: true, direction: "vertical" })).toContain(
      "min-h-",
    );
  });

  test("horizontal resizable forces no height (content-driven)", () => {
    expect(render({ resizable: true, direction: "horizontal" })).not.toContain(
      "min-h-",
    );
  });
});
