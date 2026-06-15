import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Diff, commentsForFile, diffPropsSchema, toLineAnnotations } from ".";

const PATCH = `diff --git a/example.ts b/example.ts
--- a/example.ts
+++ b/example.ts
@@ -1,3 +1,3 @@
-console.log("Hello world");
+console.warn("Updated message");
`;

const MULTI_FILE_PATCH = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,1 +1,1 @@
-const a = 1;
+const a = 2;
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,1 +1,1 @@
-const b = 1;
+const b = 2;
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

  test("accepts comments with side/line/body and optional author/file", () => {
    const parsed = diffPropsSchema.parse({
      patch: PATCH,
      comments: [
        { side: "new", line: 2, body: "use console.warn here", author: "me" },
        { side: "old", line: 2, body: "why was this removed?" },
        { file: "src/a.ts", side: "new", line: 1, body: "scoped to a file" },
      ],
    });
    expect(parsed.comments?.length).toBe(3);
    expect(parsed.comments?.[0]?.author).toBe("me");
    expect(parsed.comments?.[1]?.author).toBeUndefined();
    expect(parsed.comments?.[2]?.file).toBe("src/a.ts");
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

describe("toLineAnnotations", () => {
  test("maps old→deletions and new→additions with metadata", () => {
    const result = toLineAnnotations([
      { side: "old", line: 3, body: "removed?" },
      { side: "new", line: 7, body: "looks good", author: "me" },
    ]);
    expect(result).toEqual([
      { side: "deletions", lineNumber: 3, metadata: { body: "removed?", author: undefined } },
      { side: "additions", lineNumber: 7, metadata: { body: "looks good", author: "me" } },
    ]);
  });

  test("returns an empty array for undefined comments", () => {
    expect(toLineAnnotations(undefined)).toEqual([]);
  });
});

describe("commentsForFile", () => {
  const comments = [
    { file: "src/a.ts", side: "new" as const, line: 1, body: "on a" },
    { file: "src/b.ts", side: "new" as const, line: 1, body: "on b" },
    { side: "new" as const, line: 1, body: "no file" },
  ];

  test("matches by file name", () => {
    const result = commentsForFile(comments, { name: "src/a.ts" }, false);
    expect(result.map((c) => c.body)).toEqual(["on a"]);
  });

  test("matches a renamed file by prevName", () => {
    const renamed = [{ file: "old/a.ts", side: "new" as const, line: 1, body: "x" }];
    const result = commentsForFile(
      renamed,
      { name: "new/a.ts", prevName: "old/a.ts" },
      false,
    );
    expect(result.map((c) => c.body)).toEqual(["x"]);
  });

  test("file-less comments attach only when it is the sole file", () => {
    expect(
      commentsForFile(comments, { name: "src/a.ts" }, true).map((c) => c.body),
    ).toEqual(["on a", "no file"]);
    expect(
      commentsForFile(comments, { name: "src/a.ts" }, false).map((c) => c.body),
    ).toEqual(["on a"]);
  });

  test("returns empty for undefined comments", () => {
    expect(commentsForFile(undefined, { name: "x" }, true)).toEqual([]);
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

  test("renders one diffs-container host per file in a multi-file patch", () => {
    const html = renderToString(
      createElement(Diff, { patch: MULTI_FILE_PATCH }),
    );
    expect(html.match(/<diffs-container/g)?.length).toBe(2);
  });

  test("surfaces comments that match no file instead of dropping them silently", () => {
    const html = renderToString(
      createElement(Diff, {
        patch: MULTI_FILE_PATCH,
        // 複数ファイルで file 未指定 → どのファイルにも割り当たらない
        comments: [{ side: "new", line: 1, body: "orphan" }],
      }),
    );
    expect(html).toContain("表示できませんでした");
  });

  test("falls back when the patch cannot be parsed", () => {
    const html = renderToString(
      createElement(Diff, { patch: "not a diff at all" }),
    );
    expect(html).toContain('data-slot="diff"');
    expect(html).not.toContain("<diffs-container");
    expect(html).toContain("解釈できません");
  });
});
