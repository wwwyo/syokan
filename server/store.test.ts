import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Item } from "@/schema";
import { SnapshotStore } from "./store";

const sampleRoot: Item = { type: "Page", props: { title: "T" } };

describe("SnapshotStore", () => {
  let dir: string;
  let store: SnapshotStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "syokan-store-"));
    store = new SnapshotStore(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("create assigns id, createdAt and persists root", async () => {
    const env = await store.create({ root: sampleRoot, title: "Sample" });
    expect(env.id).toMatch(/[0-9a-f-]{36}/);
    expect(env.title).toBe("Sample");
    expect(env.root.type).toBe("Page");
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
    const next = new SnapshotStore(dir);
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

  test("idempotencyKey replays the same id on repeated create", async () => {
    const first = await store.create({
      root: sampleRoot,
      idempotencyKey: "rss-2026-05-21",
    });
    const second = await store.create({
      root: sampleRoot,
      idempotencyKey: "rss-2026-05-21",
    });
    expect(second.id).toBe(first.id);
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

  test("concurrent creates with the same idempotencyKey collapse to one snapshot", async () => {
    const [a, b, c] = await Promise.all([
      store.create({ root: sampleRoot, idempotencyKey: "concurrent" }),
      store.create({ root: sampleRoot, idempotencyKey: "concurrent" }),
      store.create({ root: sampleRoot, idempotencyKey: "concurrent" }),
    ]);
    expect(b?.id).toBe(a?.id);
    expect(c?.id).toBe(a?.id);
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
});
