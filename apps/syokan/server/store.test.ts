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

  test("update returns not_found when the key is unseen (no allow_missing escape hatch)", async () => {
    const result = await store.update({
      root: sampleRoot,
      idempotencyKey: "never-posted",
    });
    expect(result.ok).toBe(false);
  });

  test("create with idempotencyKey registers the key for later update", async () => {
    const created = await store.create({
      root: sampleRoot,
      title: "Day 1",
      idempotencyKey: "rss-2026-05-21",
    });
    const result = await store.update({
      root: sampleRoot,
      idempotencyKey: "rss-2026-05-21",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.envelope.id).toBe(created.id);
  });

  test("update replaces content in place (same id/url/createdAt, refreshed root/title)", async () => {
    const first = await store.create({
      root: sampleRoot,
      title: "Day 1",
      idempotencyKey: "recurring",
    });
    const updatedRoot: Item = { type: "Stack", props: { direction: "horizontal" } };
    const second = await store.update({
      root: updatedRoot,
      title: "Day 2",
      idempotencyKey: "recurring",
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.envelope.id).toBe(first.id);
      expect(second.envelope.title).toBe("Day 2");
      expect(second.envelope.root).toEqual(updatedRoot);
      expect(second.envelope.createdAt).toBe(first.createdAt);
    }
    const items = await store.list();
    expect(items.length).toBe(1);
    expect(items[0]?.title).toBe("Day 2");
  });

  test("update omitting title/metadata preserves the existing values instead of clearing them", async () => {
    await store.create({
      root: sampleRoot,
      title: "Day 1",
      metadata: { source: { label: "rss" } },
      idempotencyKey: "recurring-partial",
    });
    const updatedRoot: Item = { type: "Stack", props: { direction: "horizontal" } };
    const result = await store.update({
      root: updatedRoot,
      idempotencyKey: "recurring-partial",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.title).toBe("Day 1");
      expect(result.envelope.metadata?.source?.label).toBe("rss");
      expect(result.envelope.root).toEqual(updatedRoot);
    }
  });

  test("different idempotencyKeys produce different ids", async () => {
    const a = await store.create({ root: sampleRoot, idempotencyKey: "k1" });
    const b = await store.create({ root: sampleRoot, idempotencyKey: "k2" });
    expect(a.id).not.toBe(b.id);
  });

  test("without idempotencyKey every create produces a new id", async () => {
    const a = await store.create({ root: sampleRoot });
    const b = await store.create({ root: sampleRoot });
    expect(a.id).not.toBe(b.id);
  });

  test("create with an already-registered idempotencyKey dedups instead of creating a new id", async () => {
    const first = await store.create({ root: sampleRoot, idempotencyKey: "repeat" });
    const second = await store.create({
      root: { type: "Heading", props: { text: "ignored" } },
      idempotencyKey: "repeat",
    });
    expect(second.id).toBe(first.id);
    const items = await store.list();
    expect(items.length).toBe(1);
  });

  test("concurrent creates with the same new idempotencyKey collapse to one snapshot (no orphans from the PUT->404->POST fallback race)", async () => {
    const [a, b, c] = await Promise.all([
      store.create({ root: sampleRoot, idempotencyKey: "concurrent" }),
      store.create({ root: sampleRoot, idempotencyKey: "concurrent" }),
      store.create({ root: sampleRoot, idempotencyKey: "concurrent" }),
    ]);
    expect(b.id).toBe(a.id);
    expect(c.id).toBe(a.id);
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
    // Leave a lock file for a non-existent pid (= a crashed owner)
    const { writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await writeFile(join(dir, "snapshots.json.lock"), "999999:stale", "utf8");
    // The owner is dead, so create should reclaim and succeed
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
