import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { TreeDocBody, reasonFromStatus, treeDocPropsSchema } from ".";
import { parseTreeContent } from "../../lib/treeSource";

function html(path: string, state: Parameters<typeof TreeDocBody>[0]["state"]) {
  return renderToString(createElement(TreeDocBody, { path, state }));
}

describe("import cycle", () => {
  // TreeDoc → Render → catalogs/index → TreeDoc. Entering through TreeDoc (a story, a lazy chunk)
  // evaluates the registry while TreeDoc's own body is mid-flight, so anything the registry reads
  // from TreeDoc must already be initialized. This has to run in a fresh process: within this file
  // the registry is already cached, so the ordering that breaks can never be reproduced in-process.
  test("importing TreeDoc before the registry does not hit the dead zone", () => {
    // Paths ride in as argv rather than being interpolated into the source, so there is no
    // escaping to eyeball. Under `bun -e` the script itself takes no argv slot, so the two
    // paths land at [1] and [2]. They are passed as file: URLs, not bare paths — a checkout
    // directory containing a space percent-encodes into something import() cannot resolve.
    const proc = Bun.spawnSync([
      process.execPath,
      "-e",
      `(async () => {
         await import(process.argv[1]);
         const c = await import(process.argv[2]);
         if (!c.components.get("TreeDoc")) throw new Error("TreeDoc missing from the registry");
       })();`,
      new URL("./index.tsx", import.meta.url).href,
      new URL("../index.ts", import.meta.url).href,
    ]);
    // Asserted on the failure signature, not on stderr being empty: an unrelated runtime warning
    // would otherwise fail this test on a Bun upgrade.
    expect(proc.stderr.toString()).not.toContain("before initialization");
    expect(proc.exitCode).toBe(0);
  });
});

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
