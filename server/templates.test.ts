import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TemplateStore } from "./templates";

describe("TemplateStore", () => {
  let dir: string;
  let store: TemplateStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "syokan-tmpl-"));
    store = new TemplateStore(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("add assigns id/createdAt and round-trips json via get", async () => {
    const json = { root: { type: "Stack", props: {} } };
    const t = await store.add({ title: "RSS", description: "daily", json });
    expect(t.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(t.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const got = await store.get(t.id);
    expect(got?.title).toBe("RSS");
    expect(got?.description).toBe("daily");
    expect(got?.json).toEqual(json);
  });

  test("list returns summaries without json, sorted by title", async () => {
    await store.add({ title: "B", json: { x: 1 } });
    await store.add({ title: "A", json: { x: 2 } });
    const items = await store.list();
    expect(items.map((i) => i.title)).toEqual(["A", "B"]);
    expect((items[0] as { json?: unknown }).json).toBeUndefined();
  });

  test("list returns [] when the dir does not exist yet", async () => {
    const empty = new TemplateStore(join(dir, "nope"));
    expect(await empty.list()).toEqual([]);
  });

  test("list skips valid-JSON files with a malformed shape (no throw)", async () => {
    const good = await store.add({ title: "Good", json: {} });
    // 手置きされた foreign file。valid JSON だが Template の shape ではない。
    await writeFile(join(dir, "notes.json"), JSON.stringify({ foo: 1 }), "utf8");
    const items = await store.list();
    expect(items.map((i) => i.id)).toEqual([good.id]);
  });

  test("get returns undefined for unknown or malformed id", async () => {
    expect(await store.get("00000000-0000-0000-0000-000000000000")).toBeUndefined();
    // path traversal / 非 UUID は join 前に弾く
    expect(await store.get("../etc/passwd")).toBeUndefined();
    expect(await store.get("not-a-uuid")).toBeUndefined();
  });

  test("remove deletes; subsequent get returns undefined", async () => {
    const t = await store.add({ title: "X", json: {} });
    expect(await store.remove(t.id)).toBe(true);
    expect(await store.get(t.id)).toBeUndefined();
  });

  test("remove returns false for unknown or malformed id", async () => {
    expect(await store.remove("00000000-0000-0000-0000-000000000000")).toBe(false);
    expect(await store.remove("../../x")).toBe(false);
  });

  test("description is omitted when not provided", async () => {
    const t = await store.add({ title: "NoDesc", json: {} });
    const got = await store.get(t.id);
    expect(got && "description" in got).toBe(false);
  });
});
