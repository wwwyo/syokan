import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { errorMessage, Mermaid, MermaidError, mermaidPropsSchema } from ".";

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

  test("stringifies a non-Error throw, blanks an empty one", () => {
    expect(errorMessage("boom")).toBe("boom");
    // the localized headline already says the diagram failed; an invented English
    // detail line would add nothing
    expect(errorMessage(new Error("   "))).toBe("");
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

describe("MermaidError", () => {
  const html = (code: string, error: string) =>
    renderToString(createElement(MermaidError, { code, error }));

  test("shows the headline, the reason, and keeps the source readable", () => {
    const out = html("graph TD\n  A --> call", "Parse error on line 2:\n  ^");
    expect(out).toContain('data-state="error"');
    expect(out).toContain('data-slot="mermaid-error"');
    // the caret must sit in a <pre>, or it stops lining up with the token it points at
    expect(out).toContain("<pre");
    expect(out).toContain("  ^");
    expect(out).toContain("A --&gt; call");
  });

  test("omits the reason line when mermaid threw a blank message", () => {
    const out = html("graph TD", "");
    expect(out).toContain('data-slot="mermaid-error"');
    // only the source <pre> survives; the detail <pre> is gone
    expect(out.match(/<pre/g)).toHaveLength(1);
    expect(out).toContain("graph TD");
  });
});
