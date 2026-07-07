import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Item } from "../src/schema";
import { materializeTree } from "./materialize";

describe("materializeTree", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "syokan-materialize-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("TreeDoc freezes into the referenced subtree", async () => {
    const path = join(dir, "dashboard.json");
    await writeFile(
      path,
      JSON.stringify({
        type: "Stack",
        props: {},
        children: [{ type: "Text", props: { body: "frozen" } }],
      }),
    );
    const result = await materializeTree({
      type: "TreeDoc",
      props: { path },
    });
    expect(result).toEqual({
      ok: true,
      root: {
        type: "Stack",
        props: {},
        children: [{ type: "Text", props: { body: "frozen" } }],
      },
    });
  });

  test("a nested TreeDoc node is materialized in place; key is preserved", async () => {
    const path = join(dir, "sub.json");
    await writeFile(path, JSON.stringify({ type: "Text", props: { body: "sub" } }));
    const tree: Item = {
      type: "Stack",
      props: {},
      children: [
        { type: "Heading", props: { text: "T" } },
        { type: "TreeDoc", props: { path }, key: "k1" },
      ],
    };
    const result = await materializeTree(tree);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.root.children?.[1]).toEqual({
      type: "Text",
      props: { body: "sub" },
      key: "k1",
    });
  });

  test("a single read failure fails the whole tree with path + reason", async () => {
    const missing = join(dir, "gone.json");
    const okPath = join(dir, "ok.json");
    await writeFile(okPath, JSON.stringify({ type: "Text", props: { body: "ok" } }));
    const result = await materializeTree({
      type: "Stack",
      props: {},
      children: [
        { type: "TreeDoc", props: { path: okPath } },
        { type: "TreeDoc", props: { path: missing } },
      ],
    });
    expect(result).toEqual({ ok: false, path: missing, reason: "not_found" });
  });

  test("broken JSON fails with invalid_json", async () => {
    const path = join(dir, "broken.json");
    await writeFile(path, "{ not json");
    const result = await materializeTree({ type: "TreeDoc", props: { path } });
    expect(result).toEqual({ ok: false, path, reason: "invalid_json" });
  });

  test("JSON that is not a catalog tree fails with invalid_tree", async () => {
    const path = join(dir, "notatree.json");
    await writeFile(path, JSON.stringify({ hello: "world" }));
    const result = await materializeTree({ type: "TreeDoc", props: { path } });
    expect(result).toEqual({ ok: false, path, reason: "invalid_tree" });
  });

  test("a TreeDoc nested inside the referenced tree fails with nested_treedoc", async () => {
    const inner = join(dir, "inner.json");
    const path = join(dir, "outer.json");
    await writeFile(
      path,
      JSON.stringify({
        type: "Stack",
        props: {},
        children: [{ type: "TreeDoc", props: { path: inner } }],
      }),
    );
    const result = await materializeTree({ type: "TreeDoc", props: { path } });
    expect(result).toEqual({ ok: false, path, reason: "nested_treedoc" });
  });

  test("a self-referencing TreeDoc does not recurse infinitely", async () => {
    const path = join(dir, "self.json");
    await writeFile(path, JSON.stringify({ type: "TreeDoc", props: { path } }));
    const result = await materializeTree({ type: "TreeDoc", props: { path } });
    expect(result).toEqual({ ok: false, path, reason: "nested_treedoc" });
  });

  test("the input tree is not mutated", async () => {
    const path = join(dir, "keep.json");
    await writeFile(path, JSON.stringify({ type: "Text", props: { body: "k" } }));
    const tree: Item = {
      type: "Stack",
      props: {},
      children: [{ type: "TreeDoc", props: { path } }],
    };
    const before = structuredClone(tree);
    const result = await materializeTree(tree);
    expect(result.ok).toBe(true);
    expect(tree).toEqual(before);
    if (result.ok) expect(result.root).not.toBe(tree);
  });

  test("a tree without TreeDoc passes through structurally unchanged", async () => {
    const tree: Item = {
      type: "Stack",
      props: {},
      children: [
        { type: "Heading", props: { text: "S" }, key: "h" },
        { type: "Text", props: { body: "b" } },
      ],
    };
    const result = await materializeTree(tree);
    expect(result).toEqual({ ok: true, root: tree });
  });

  test("cross-cutting id and tags survive the copy", async () => {
    const tree: Item = {
      type: "Stack",
      props: {},
      id: "root",
      children: [
        { type: "Text", props: { body: "x" }, id: "risk-1", tags: ["High"] },
      ],
    };
    const result = await materializeTree(tree);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.root.id).toBe("root");
      expect(result.root.children?.[0]?.id).toBe("risk-1");
      expect(result.root.children?.[0]?.tags).toEqual(["High"]);
    }
  });

  test("publish strips probe check/result unless shareVisible", async () => {
    const probe: Item = {
      type: "Probe",
      props: {
        label: "no diff",
        check: {
          kind: "diff_clean",
          repo: "/home/me/repo",
          base: "main",
          paths: ["src/a.ts"],
        },
        result: { status: "pass", ranAt: "2026-07-06T00:00:00Z" },
      },
    };
    const result = await materializeTree(probe);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.root.props).toEqual({ label: "no diff" });
    }
  });

  test("shareVisible probes keep check/result on publish", async () => {
    const probe: Item = {
      type: "Probe",
      props: {
        check: { kind: "file_exists", path: "/repo/README.md" },
        result: { status: "pass", ranAt: "2026-07-06T00:00:00Z" },
        shareVisible: true,
      },
    };
    const result = await materializeTree(probe);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.root.props.check).toBeDefined();
      expect(result.root.props.result).toBeDefined();
    }
  });

  test("probes inside a synced TreeDoc subtree are also redacted", async () => {
    const path = join(dir, "with-probe.json");
    await writeFile(
      path,
      JSON.stringify({
        type: "Stack",
        props: {},
        children: [
          {
            type: "Probe",
            props: {
              check: { kind: "file_exists", path: "/secret/place" },
            },
          },
        ],
      }),
    );
    const result = await materializeTree({ type: "TreeDoc", props: { path } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.root.children?.[0]?.props).toEqual({});
    }
  });
});
