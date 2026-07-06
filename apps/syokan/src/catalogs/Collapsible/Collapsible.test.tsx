import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Collapsible, collapsiblePropsSchema } from ".";

describe("collapsiblePropsSchema", () => {
  test("accepts string and inline summaries", () => {
    expect(collapsiblePropsSchema.safeParse({ summary: "Evidence" }).success).toBe(true);
    expect(
      collapsiblePropsSchema.safeParse({
        summary: [{ type: "Badge", props: { text: "None" } }],
        defaultOpen: true,
      }).success,
    ).toBe(true);
  });

  test("rejects unknown props", () => {
    expect(
      collapsiblePropsSchema.safeParse({ summary: "x", open: true }).success,
    ).toBe(false);
  });
});

describe("Collapsible", () => {
  test("hides the body when closed (default), keeping it in the DOM for reveal", () => {
    const html = renderToString(
      createElement(
        Collapsible,
        { summary: "Evidence" },
        createElement("p", null, "hunk body"),
      ),
    );
    expect(html).toContain("Evidence");
    expect(html).toContain("hunk body");
    expect(html).toContain("hidden");
    expect(html).toContain('aria-expanded="false"');
  });

  test("shows the body when defaultOpen", () => {
    const html = renderToString(
      createElement(
        Collapsible,
        { summary: "Detail", defaultOpen: true },
        createElement("p", null, "body"),
      ),
    );
    expect(html).toContain('aria-expanded="true"');
    // the body wrapper must not carry the hidden class (icons carry aria-hidden, so
    // match the class attribute exactly)
    expect(html).not.toContain('class="ml-5.5 mt-1.5 hidden"');
    expect(html).not.toContain("data-reveal");
  });
});
