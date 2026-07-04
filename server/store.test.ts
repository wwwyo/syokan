import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Item } from "@/schema";
import { createSnapshotStore, type SnapshotStore } from "./store";

const sampleRoot: Item = { type: "Stack", props: {} };

describe("SnapshotStore", () => {
  let dir: string;
  let store: SnapshotStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "syokan-store-"));
    store = createSnapshotStore(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("create assigns id, createdAt and persists root", async () => {
    const env = await store.create({ root: sampleRoot, title: "Sample" });
    expect(env.id).toMatch(/[0-9a-f-]{36}/);
    expect(env.title).toBe("Sample");
    expect(env.root.type).toBe("Stack");
    expect(env.schemaVersion).toBe(1);
    expect(env.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("get returns the stored envelope by id", async () => {
    const env = await store.create({ root: sampleRoot });
    const got = await store.get(env.id);
    expect(got?.id).toBe(env.id);
  });

  test("get returns undefined for unknown id", async () => {
    const got = await store.get("missing");
    expect(got).toBeUndefined();
  });

  test("survives a 'restart' (fresh store instance over the same file)", async () => {
    const env = await store.create({ root: sampleRoot });
    const next = createSnapshotStore(dir);
    const got = await next.get(env.id);
    expect(got?.id).toBe(env.id);
  });

  test("list returns id/title/createdAt and optional source.label", async () => {
    const a = await store.create({ root: sampleRoot, title: "A" });
    const b = await store.create({
      root: sampleRoot,
      title: "B",
      metadata: { source: { label: "rss-daily" } },
    });
    const items = await store.list();
    expect(items.length).toBe(2);
    const found = items.find((i) => i.id === b.id);
    expect(found?.source?.label).toBe("rss-daily");
    expect(items.some((i) => i.id === a.id)).toBe(true);
  });

  test("list returns empty array when store is empty", async () => {
    const items = await store.list();
    expect(items).toEqual([]);
  });

  test("delete removes the snapshot and returns true; further get is undefined", async () => {
    const env = await store.create({ root: sampleRoot });
    const ok = await store.delete(env.id);
    expect(ok).toBe(true);
    const got = await store.get(env.id);
    expect(got).toBeUndefined();
  });

  test("delete returns false for unknown id", async () => {
    const ok = await store.delete("missing");
    expect(ok).toBe(false);
  });

  test("get does not return Object.prototype members for crafted ids", async () => {
    for (const id of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      expect(await store.get(id)).toBeUndefined();
    }
  });

  test("delete returns false for prototype-chain ids and does not rewrite", async () => {
    expect(await store.delete("constructor")).toBe(false);
    expect(await store.delete("__proto__")).toBe(false);
  });

  test("update without allowMissing returns not_found when the key is unseen", async () => {
    const result = await store.update({
      root: sampleRoot,
      idempotencyKey: "never-posted",
    });
    expect(result.ok).toBe(false);
  });

  test("update with allowMissing:true creates on first use of a key", async () => {
    const result = await store.update({
      root: sampleRoot,
      idempotencyKey: "rss-2026-05-21",
      allowMissing: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.created).toBe(true);
      expect(result.envelope.id).toMatch(/[0-9a-f-]{36}/);
    }
  });

  test("update replays the same id once a key exists, even without allowMissing", async () => {
    const first = await store.update({
      root: sampleRoot,
      idempotencyKey: "rss-2026-05-21",
      allowMissing: true,
    });
    const second = await store.update({
      root: sampleRoot,
      idempotencyKey: "rss-2026-05-21",
    });
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.envelope.id).toBe(first.envelope.id);
  });

  test("update replaces content in place (same id/url/createdAt, refreshed root/title)", async () => {
    const first = await store.update({
      root: sampleRoot,
      title: "Day 1",
      idempotencyKey: "recurring",
      allowMissing: true,
    });
    const updatedRoot: Item = { type: "Stack", props: { direction: "horizontal" } };
    const second = await store.update({
      root: updatedRoot,
      title: "Day 2",
      idempotencyKey: "recurring",
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.envelope.id).toBe(first.envelope.id);
      expect(second.created).toBe(false);
      expect(second.envelope.title).toBe("Day 2");
      expect(second.envelope.root).toEqual(updatedRoot);
      expect(second.envelope.createdAt).toBe(first.envelope.createdAt);
    }
    const items = await store.list();
    expect(items.length).toBe(1);
    expect(items[0]?.title).toBe("Day 2");
  });

  test("different idempotencyKeys produce different ids", async () => {
    const a = await store.update({ root: sampleRoot, idempotencyKey: "k1", allowMissing: true });
    const b = await store.update({ root: sampleRoot, idempotencyKey: "k2", allowMissing: true });
    expect(a.ok && b.ok && a.envelope.id !== b.envelope.id).toBe(true);
  });

  test("without idempotencyKey every create produces a new id", async () => {
    const a = await store.create({ root: sampleRoot });
    const b = await store.create({ root: sampleRoot });
    expect(a.id).not.toBe(b.id);
  });

  test("concurrent updates with the same new idempotencyKey+allowMissing collapse to one snapshot", async () => {
    const [a, b, c] = await Promise.all([
      store.update({ root: sampleRoot, idempotencyKey: "concurrent", allowMissing: true }),
      store.update({ root: sampleRoot, idempotencyKey: "concurrent", allowMissing: true }),
      store.update({ root: sampleRoot, idempotencyKey: "concurrent", allowMissing: true }),
    ]);
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (a.ok && b.ok && c.ok) {
      expect(b.envelope.id).toBe(a.envelope.id);
      expect(c.envelope.id).toBe(a.envelope.id);
    }
    const items = await store.list();
    expect(items.length).toBe(1);
  });

  test("concurrent distinct creates do not lose updates (serialized writes)", async () => {
    await Promise.all(
      Array.from({ length: 10 }, () => store.create({ root: sampleRoot })),
    );
    const items = await store.list();
    expect(items.length).toBe(10);
  });

  test("reclaims a lock held by a dead process (crash recovery)", async () => {
    // 存在しない pid の lock file を残しておく (= crash した owner)
    const { writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await writeFile(join(dir, "snapshots.json.lock"), "999999:stale", "utf8");
    // owner が死んでいるので reclaim して create が成功するはず
    const env = await store.create({ root: sampleRoot });
    expect(env.id).toMatch(/[0-9a-f-]{36}/);
    expect((await store.get(env.id))?.id).toBe(env.id);
  });

  test("concurrent creates across separate instances all persist (cross-process lock)", async () => {
    const a = createSnapshotStore(dir);
    const b = createSnapshotStore(dir);
    await Promise.all([
      a.create({ root: sampleRoot }),
      b.create({ root: sampleRoot }),
      a.create({ root: sampleRoot }),
      b.create({ root: sampleRoot }),
    ]);
    const items = await createSnapshotStore(dir).list();
    expect(items.length).toBe(4);
  });
});
