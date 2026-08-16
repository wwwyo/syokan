import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { errorMessage, Mermaid, mermaidPropsSchema } from ".";

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

describe("errorMessage", () => {
  test("keeps the parse message, truncates a runaway one", () => {
    expect(errorMessage(new Error("Parse error on line 2:\n  ^"))).toBe(
      "Parse error on line 2:\n  ^",
    );
    const long = errorMessage(new Error("x".repeat(1000)));
    expect(long.length).toBeLessThan(1000);
    expect(long.endsWith("…")).toBe(true);
  });

  test("falls back to a reason for non-Error and blank throws", () => {
    expect(errorMessage("boom")).toBe("boom");
    expect(errorMessage(new Error("   "))).toBe("Unknown error");
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
