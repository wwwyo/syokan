import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { TreeDocBody, reasonFromStatus, treeDocPropsSchema } from ".";
import { parseTreeContent } from "../../lib/treeSource";

function html(path: string, state: Parameters<typeof TreeDocBody>[0]["state"]) {
  return renderToString(createElement(TreeDocBody, { path, state }));
}

describe("treeDocPropsSchema", () => {
  test("accepts an absolute path, rejects empty / relative / URL / extra keys", () => {
    expect(treeDocPropsSchema.safeParse({ path: "/a/tree.json" }).success).toBe(
      true,
    );
    expect(
      treeDocPropsSchema.safeParse({ path: "C:\\work\\tree.json" }).success,
    ).toBe(true);
    expect(treeDocPropsSchema.safeParse({ path: "" }).success).toBe(false);
    expect(treeDocPropsSchema.safeParse({ path: "tree.json" }).success).toBe(
      false,
    );
    expect(treeDocPropsSchema.safeParse({ path: "./tree.json" }).success).toBe(
      false,
    );
    expect(
      treeDocPropsSchema.safeParse({ path: "https://example.com/tree.json" })
        .success,
    ).toBe(false);
    expect(
      treeDocPropsSchema.safeParse({ path: "file:///a/tree.json" }).success,
    ).toBe(false);
    expect(treeDocPropsSchema.safeParse({}).success).toBe(false);
    expect(
      treeDocPropsSchema.safeParse({ path: "/a", watch: true }).success,
    ).toBe(false);
  });
});

describe("parseTreeContent", () => {
  test("valid catalog tree parses", () => {
    const result = parseTreeContent(
      JSON.stringify({
        type: "Stack",
        props: {},
        children: [{ type: "Text", props: { body: "hi" } }],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.root.type).toBe("Stack");
  });

  test("broken JSON → invalid_json", () => {
    expect(parseTreeContent("{ not json")).toEqual({
      ok: false,
      reason: "invalid_json",
    });
  });

  test("JSON that is not a catalog tree → invalid_tree", () => {
    expect(parseTreeContent(JSON.stringify({ hello: "world" }))).toEqual({
      ok: false,
      reason: "invalid_tree",
    });
    expect(
      parseTreeContent(JSON.stringify({ type: "Nope", props: {} })),
    ).toEqual({ ok: false, reason: "invalid_tree" });
  });

  test("nested TreeDoc (including at the root) → nested_treedoc", () => {
    expect(
      parseTreeContent(
        JSON.stringify({ type: "TreeDoc", props: { path: "/a/self.json" } }),
      ),
    ).toEqual({ ok: false, reason: "nested_treedoc" });
    expect(
      parseTreeContent(
        JSON.stringify({
          type: "Stack",
          props: {},
          children: [{ type: "TreeDoc", props: { path: "/a/other.json" } }],
        }),
      ),
    ).toEqual({ ok: false, reason: "nested_treedoc" });
  });
});

describe("reasonFromStatus", () => {
  test("prefers a known body.error", () => {
    expect(reasonFromStatus(500, { error: "not_text" })).toBe("not_text");
    // the server's 400 splits into missing_path / invalid_path via the body
    expect(reasonFromStatus(400, { error: "invalid_path" })).toBe("invalid_path");
  });

  test("falls back to the status when the body is unreadable", () => {
    expect(reasonFromStatus(413, null)).toBe("too_large");
    expect(reasonFromStatus(422, null)).toBe("not_regular_file");
  });

  test("unknown status → generic error", () => {
    expect(reasonFromStatus(500, null)).toBe("error");
  });
});

describe("TreeDocBody", () => {
  const tree = { type: "Text" as const, props: { body: "hello tree" } };

  test("loading shows a placeholder", () => {
    expect(
      html("/a/tree.json", { root: null, error: null, loading: true }),
    ).toContain('data-slot="tree-doc-loading"');
  });

  test("a valid tree renders the subtree", () => {
    const out = html("/a/tree.json", { root: tree, error: null, loading: false });
    expect(out).toContain("hello tree");
    expect(out).not.toContain('data-slot="tree-doc-error"');
  });

  test("error without a previous tree shows the reason and the path", () => {
    const out = html("/a/tree.json", {
      root: null,
      error: "invalid_json",
      loading: false,
    });
    expect(out).toContain('data-slot="tree-doc-error"');
    expect(out).toContain("not valid JSON");
    expect(out).toContain("/a/tree.json");
  });

  test("error with a previous tree keeps the stale content and adds a notice", () => {
    const out = html("/a/tree.json", {
      root: tree,
      error: "invalid_tree",
      loading: false,
    });
    expect(out).toContain('data-slot="tree-doc-error"');
    expect(out).toContain("hello tree");
    expect(out).toContain("last valid content");
  });
});
