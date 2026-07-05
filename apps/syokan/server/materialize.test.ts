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

  test("FileDoc for .md becomes MarkdownDoc with the file body", async () => {
    const path = join(dir, "notes.md");
    await writeFile(path, "# hi\n\nbody");
    const result = await materializeTree({
      type: "FileDoc",
      props: { path },
    });
    expect(result).toEqual({
      ok: true,
      root: { type: "MarkdownDoc", props: { body: "# hi\n\nbody" } },
    });
  });

  test("FileDoc for .json becomes Code with lang/filename derived from the path", async () => {
    const path = join(dir, "config.json");
    await writeFile(path, '{"a":1}');
    const result = await materializeTree({
      type: "FileDoc",
      props: { path },
    });
    expect(result).toEqual({
      ok: true,
      root: {
        type: "Code",
        props: { code: '{"a":1}', lang: "json", filename: "config.json" },
      },
    });
  });

  test("FileDoc for .log becomes PlainText", async () => {
    const path = join(dir, "run.log");
    await writeFile(path, "line1\nline2");
    const result = await materializeTree({
      type: "FileDoc",
      props: { path },
    });
    expect(result).toEqual({
      ok: true,
      root: { type: "PlainText", props: { body: "line1\nline2" } },
    });
  });

  test("a nested FileDoc is materialized in place; key is preserved", async () => {
    const path = join(dir, "doc.md");
    await writeFile(path, "# nested");
    const tree: Item = {
      type: "Stack",
      props: {},
      children: [
        { type: "Heading", props: { text: "T" } },
        { type: "FileDoc", props: { path }, key: "k1" },
      ],
    };
    const result = await materializeTree(tree);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.root.children?.[1]).toEqual({
      type: "MarkdownDoc",
      props: { body: "# nested" },
      key: "k1",
    });
  });

  test("a single read failure fails the whole tree with path + reason", async () => {
    const missing = join(dir, "gone.md");
    const okPath = join(dir, "ok.md");
    await writeFile(okPath, "# ok");
    const result = await materializeTree({
      type: "Stack",
      props: {},
      children: [
        { type: "FileDoc", props: { path: okPath } },
        { type: "FileDoc", props: { path: missing } },
      ],
    });
    expect(result).toEqual({ ok: false, path: missing, reason: "not_found" });
  });

  test("the input tree is not mutated", async () => {
    const path = join(dir, "keep.md");
    await writeFile(path, "# keep");
    const tree: Item = {
      type: "Stack",
      props: {},
      children: [{ type: "FileDoc", props: { path } }],
    };
    const before = structuredClone(tree);
    const result = await materializeTree(tree);
    expect(result.ok).toBe(true);
    expect(tree).toEqual(before);
    if (result.ok) expect(result.root).not.toBe(tree);
  });

  test("a tree without FileDoc passes through structurally unchanged", async () => {
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
});
