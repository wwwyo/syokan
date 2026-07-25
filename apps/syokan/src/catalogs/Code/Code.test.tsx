import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Code, codePropsSchema, dropIncompletePre } from ".";

describe("codePropsSchema", () => {
  test("accepts code with optional lang/filename", () => {
    expect(codePropsSchema.parse({ code: "const x = 1;" })).toEqual({
      code: "const x = 1;",
    });
    expect(
      codePropsSchema.parse({ code: "x", lang: "ts", filename: "a.ts" }),
    ).toEqual({ code: "x", lang: "ts", filename: "a.ts" });
  });

  test("rejects missing code and unknown keys (strict)", () => {
    expect(codePropsSchema.safeParse({ lang: "ts" }).success).toBe(false);
    expect(codePropsSchema.safeParse({ code: "x", extra: 1 }).success).toBe(
      false,
    );
  });
});

describe("Code", () => {
  // The code body is rendered by @pierre/diffs' File on the client side (shadow DOM),
  // so SSR emits only the host element. The visuals are covered by Storybook.
  test("renders the pierre File host with a copy button", () => {
    const html = renderToString(createElement(Code, { code: "const x = 1;" }));
    expect(html).toContain('data-slot="code"');
    expect(html).toContain("<diffs-container");
    expect(html).toContain('data-slot="code-copy"');
  });

  test("renders a filename header row when filename is given", () => {
    const html = renderToString(
      createElement(Code, { code: "x", filename: "a.ts" }),
    );
    expect(html).toContain('data-slot="code-filename"');
    expect(html).toContain("a.ts");
  });
});

describe("dropIncompletePre", () => {
  // A fake shadow root: this suite has no DOM, and the point under test is which <pre> the
  // predicate picks — not pierre's rendering.
  function fakeRoot(pres: boolean[]) {
    const nodes = pres.map((hasCode) => ({
      hasCode,
      removed: false,
      querySelector: (sel: string) =>
        sel === "[data-code]" && hasCode ? ({} as Element) : null,
      remove() {
        this.removed = true;
      },
    }));
    const root = {
      querySelectorAll: () => nodes,
    } as unknown as ShadowRoot;
    return { root, nodes };
  }

  test("removes a placeholder <pre> that never received the highlighted body", () => {
    const { root, nodes } = fakeRoot([false]);
    dropIncompletePre(root);
    expect(nodes[0]?.removed).toBe(true);
  });

  test("leaves a completed <pre> alone (warm / production renders must not be touched)", () => {
    const { root, nodes } = fakeRoot([true]);
    dropIncompletePre(root);
    expect(nodes[0]?.removed).toBe(false);
  });

  test("checks every <pre>, not just the first", () => {
    const { root, nodes } = fakeRoot([true, false, true]);
    dropIncompletePre(root);
    expect(nodes.map((n) => n.removed)).toEqual([false, true, false]);
  });

  test("tolerates a missing shadow root", () => {
    expect(() => dropIncompletePre(null)).not.toThrow();
    expect(() => dropIncompletePre(undefined)).not.toThrow();
  });
});
