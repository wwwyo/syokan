import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Diff, diffPropsSchema } from ".";

const PATCH = `diff --git a/example.ts b/example.ts
--- a/example.ts
+++ b/example.ts
@@ -1,3 +1,3 @@
-console.log("Hello world");
+console.warn("Updated message");
`;

describe("diffPropsSchema", () => {
  test("accepts a patch string with optional diffStyle", () => {
    expect(diffPropsSchema.parse({ patch: PATCH })).toEqual({ patch: PATCH });
    expect(
      diffPropsSchema.parse({ patch: PATCH, diffStyle: "split" }),
    ).toEqual({ patch: PATCH, diffStyle: "split" });
  });

  test("rejects missing patch", () => {
    expect(diffPropsSchema.safeParse({ diffStyle: "unified" }).success).toBe(
      false,
    );
  });

  test("rejects unknown diffStyle", () => {
    expect(
      diffPropsSchema.safeParse({ patch: PATCH, diffStyle: "inline" }).success,
    ).toBe(false);
  });

  test("rejects unknown keys (strict)", () => {
    expect(
      diffPropsSchema.safeParse({ patch: PATCH, lang: "ts" }).success,
    ).toBe(false);
  });

  test("accepts comments with side/line/body and optional author", () => {
    const parsed = diffPropsSchema.parse({
      patch: PATCH,
      comments: [
        { side: "new", line: 2, body: "use console.warn here", author: "me" },
        { side: "old", line: 2, body: "why was this removed?" },
      ],
    });
    expect(parsed.comments?.length).toBe(2);
    expect(parsed.comments?.[0]?.author).toBe("me");
    expect(parsed.comments?.[1]?.author).toBeUndefined();
  });

  test("rejects invalid comment side / non-positive line / missing body", () => {
    expect(
      diffPropsSchema.safeParse({
        patch: PATCH,
        comments: [{ side: "left", line: 1, body: "x" }],
      }).success,
    ).toBe(false);
    expect(
      diffPropsSchema.safeParse({
        patch: PATCH,
        comments: [{ side: "new", line: 0, body: "x" }],
      }).success,
    ).toBe(false);
    expect(
      diffPropsSchema.safeParse({
        patch: PATCH,
        comments: [{ side: "new", line: 1 }],
      }).success,
    ).toBe(false);
  });
});

describe("Diff", () => {
  // 実際の diff 描画は client 側 (useEffect + shadow DOM) で行われるため SSR では
  // host 要素のみ出る。ここでは「落ちずに pierre の container を出す」ことだけ確認し、
  // 視覚的な検証は Storybook に委ねる。
  test("renders the pierre diffs container host without throwing", () => {
    const html = renderToString(createElement(Diff, { patch: PATCH }));
    expect(html).toContain('data-slot="diff"');
    expect(html).toContain("<diffs-container");
  });
});
