import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Mermaid, mermaidPropsSchema } from ".";

describe("mermaidPropsSchema", () => {
  test("accepts code, rejects empty / extra keys", () => {
    expect(mermaidPropsSchema.safeParse({ code: "graph TD; A-->B" }).success).toBe(
      true,
    );
    expect(mermaidPropsSchema.safeParse({ code: "" }).success).toBe(false);
    expect(mermaidPropsSchema.safeParse({}).success).toBe(false);
    expect(
      mermaidPropsSchema.safeParse({ code: "graph TD", theme: "dark" }).success,
    ).toBe(false);
  });
});

describe("Mermaid", () => {
  test("SSR emits the raw code as a <pre> fallback (diagram renders client-side)", () => {
    const html = renderToString(
      createElement(Mermaid, { code: "graph TD\n  A --> B" }),
    );
    expect(html).toContain('data-slot="mermaid"');
    expect(html).toContain("A --&gt; B");
  });
});
