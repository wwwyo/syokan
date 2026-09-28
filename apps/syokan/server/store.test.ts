import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Item } from "../src/schema";
import { createSnapshotStore, type SnapshotStore } from "./store";
import { checklistTree, checkWriteback } from "./testkit";

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

  test("strips since-removed fields (metadata) from snapshots persisted by older versions", async () => {
    const legacy = {
      schemaVersion: 1,
      id: "legacy-1",
      title: "Legacy",
      root: sampleRoot,
      createdAt: "2026-05-01T00:00:00.000Z",
      metadata: { source: { label: "rss" } },
    };
    await Bun.write(
      join(dir, "snapshots.json"),
      JSON.stringify({
        snapshots: { "legacy-1": legacy },
        idempotency: { "legacy-key": "legacy-1" },
      }),
    );
    const got = await store.get("legacy-1");
    expect(got?.title).toBe("Legacy");
    expect(got && "metadata" in got).toBe(false);
    // persisted before archiving existed: no archivedAt on disk, null in responses
    expect(got?.archivedAt).toBeNull();
    expect((await store.list())[0]?.archivedAt).toBeNull();
    const deduped = await store.create({
      root: sampleRoot,
      idempotencyKey: "legacy-key",
    });
    expect(deduped.id).toBe("legacy-1");
    expect("metadata" in deduped).toBe(false);
    expect(deduped.archivedAt).toBeNull();
  });

  test("strips a legacy `tags` field from every node in the tree on get()", async () => {
    const legacyRoot = {
      type: "Stack",
      props: {},
      tags: ["root-tag"],
      children: [
        { type: "Text", props: { body: "x" }, id: "n1", tags: ["High"] },
      ],
    };
    const legacy = {
      schemaVersion: 1,
      id: "legacy-tags-1",
      title: "Legacy tags",
      root: legacyRoot,
      createdAt: "2026-05-01T00:00:00.000Z",
    };
    await Bun.write(
      join(dir, "snapshots.json"),
      JSON.stringify({
        snapshots: { "legacy-tags-1": legacy },
        idempotency: { "legacy-tags-key": "legacy-tags-1" },
      }),
    );
    const got = await store.get("legacy-tags-1");
    expect(got && "tags" in got.root).toBe(false);
    expect(got?.root.children?.[0] && "tags" in got.root.children[0]).toBe(
      false,
    );
    expect(got?.root.children?.[0]?.id).toBe("n1");
  });

  test("a malformed `children` on disk degrades to a readable snapshot, not a 500", async () => {
    // Stored snapshots are read without revalidation, so children can be any shape
    // (hand-edited file, older writer). Reading must still return the node.
    const legacy = {
      schemaVersion: 1,
      id: "broken-children-1",
      root: { type: "Stack", props: {}, tags: ["x"], children: "not-an-array" },
      createdAt: "2026-05-01T00:00:00.000Z",
    };
    await Bun.write(
      join(dir, "snapshots.json"),
      JSON.stringify({
        snapshots: { "broken-children-1": legacy },
        idempotency: {},
      }),
    );
    const got = await store.get("broken-children-1");
    expect(got?.root.type).toBe("Stack");
    expect(got && "tags" in got.root).toBe(false);
    expect(got?.root.children).toBeUndefined();
  });

  test("strips a legacy `tags` field from the dedup create() response too", async () => {
    const legacyRoot = {
      type: "Stack",
      props: {},
      children: [
        { type: "Text", props: { body: "x" }, id: "n1", tags: ["High"] },
      ],
    };
    const legacy = {
      schemaVersion: 1,
      id: "legacy-tags-2",
      root: legacyRoot,
      createdAt: "2026-05-01T00:00:00.000Z",
    };
    await Bun.write(
      join(dir, "snapshots.json"),
      JSON.stringify({
        snapshots: { "legacy-tags-2": legacy },
        idempotency: { "legacy-tags-key-2": "legacy-tags-2" },
      }),
    );
    const deduped = await store.create({
      root: sampleRoot,
      idempotencyKey: "legacy-tags-key-2",
    });
    expect(deduped.id).toBe("legacy-tags-2");
    expect(deduped.root.children?.[0] && "tags" in deduped.root.children[0]).toBe(
      false,
    );
  });

  test("survives a 'restart' (fresh store instance over the same file)", async () => {
    const env = await store.create({ root: sampleRoot });
    const next = createSnapshotStore(dir);
    const got = await next.get(env.id);
    expect(got?.id).toBe(env.id);
  });

  test("list returns id/title/createdAt", async () => {
    const a = await store.create({ root: sampleRoot, title: "A" });
    const b = await store.create({ root: sampleRoot, title: "B" });
    const items = await store.list();
    expect(items.length).toBe(2);
    const found = items.find((i) => i.id === b.id);
    expect(found?.title).toBe("B");
    expect(found?.createdAt).toBe(b.createdAt);
    expect(items.some((i) => i.id === a.id)).toBe(true);
  });

  test("list returns empty array when store is empty", async () => {
    const items = await store.list();
    expect(items).toEqual([]);
  });

  test("delete archives: drops from the active list, get falls back to the archive record", async () => {
    const env = await store.create({ root: sampleRoot, title: "Daily" });
    expect(env.archivedAt).toBeNull();
    const ok = await store.delete(env.id);
    expect(ok).toBe(true);
    expect(await store.list()).toEqual([]);
    const got = await store.get(env.id);
    expect(got?.id).toBe(env.id);
    expect(got?.title).toBe("Daily");
    expect(got?.createdAt).toBe(env.createdAt);
    expect(got?.archivedAt).toEqual(expect.any(String));
    expect(await Bun.file(join(dir, "archive", `${env.id}.json`)).exists()).toBe(
      true,
    );
  });

  test("the archive keeps written-back check state", async () => {
    const env = await store.create({ root: checklistTree });
    await store.patch(env.id, { nodeId: "todo", ...checkWriteback("b") }, () => true);
    await store.delete(env.id);
    const got = await store.get(env.id);
    const items = (got?.root.children?.[0]?.props as {
      items: { label: string; checked?: boolean }[];
    }).items;
    expect(items.find((i) => i.label === "b")?.checked).toBe(true);
  });

  test("an archived snapshot is read-only: patch reports not_found", async () => {
    const env = await store.create({ root: checklistTree });
    await store.delete(env.id);
    const result = await store.patch(
      env.id,
      { nodeId: "todo", ...checkWriteback("b") },
      () => true,
    );
    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  test("list({ archived }) returns archive records with archivedAt; the default stays active-only", async () => {
    const a = await store.create({ root: sampleRoot, title: "A" });
    const b = await store.create({ root: sampleRoot, title: "B" });
    await store.create({ root: sampleRoot, title: "still active" });
    await store.delete(a.id);
    await store.delete(b.id);
    const archived = await store.list({ archived: true });
    expect(archived.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
    expect(archived.every((s) => typeof s.archivedAt === "string")).toBe(true);
    expect((await store.list()).map((s) => s.archivedAt)).toEqual([null]);
  });

  test("revive: posting an archived id's idempotencyKey restores that id with the posted content, archive untouched", async () => {
    const first = await store.create({
      root: checklistTree,
      title: "v1",
      idempotencyKey: "file:/tmp/daily.json",
    });
    await store.patch(first.id, { nodeId: "todo", ...checkWriteback("b") }, () => true);
    await store.delete(first.id);
    const revived = await store.create({
      root: sampleRoot,
      title: "v2",
      idempotencyKey: "file:/tmp/daily.json",
    });
    expect(revived.id).toBe(first.id);
    expect(revived.title).toBe("v2");
    expect(revived.archivedAt).toBeNull();
    // active wins on get
    expect((await store.get(first.id))?.title).toBe("v2");
    // the archive record (with the old check) is still there
    const [record] = await store.list({ archived: true });
    expect(record?.id).toBe(first.id);
    expect(record?.title).toBe("v1");
    // and a later PUT on the key targets the revived snapshot again
    const updated = await store.update({
      root: sampleRoot,
      title: "v3",
      idempotencyKey: "file:/tmp/daily.json",
    });
    expect(updated.ok && updated.envelope.id).toBe(first.id);
  });

  test("re-archiving overwrites the record with the latest envelope", async () => {
    const env = await store.create({
      root: sampleRoot,
      title: "v1",
      idempotencyKey: "k",
    });
    await store.delete(env.id);
    expect((await store.get(env.id))?.title).toBe("v1");
    await store.create({ root: sampleRoot, title: "v2", idempotencyKey: "k" });
    await store.delete(env.id);
    const second = await store.get(env.id);
    expect(second?.title).toBe("v2");
    expect(second?.archivedAt).toEqual(expect.any(String));
    expect(await store.list({ archived: true })).toHaveLength(1);
  });

  test("purge removes only the archive record and forgets the key of an inactive id", async () => {
    const env = await store.create({ root: sampleRoot, idempotencyKey: "gone" });
    await store.delete(env.id);
    expect(await store.purge(env.id)).toBe(true);
    expect(await store.get(env.id)).toBeUndefined();
    expect(await store.purge(env.id)).toBe(false);
    // nothing left to revive: the key now mints a fresh id
    const again = await store.create({ root: sampleRoot, idempotencyKey: "gone" });
    expect(again.id).not.toBe(env.id);
  });

  test("purge returns false for an active snapshot without an archive record", async () => {
    const env = await store.create({ root: sampleRoot });
    expect(await store.purge(env.id)).toBe(false);
    expect((await store.get(env.id))?.archivedAt).toBeNull();
  });

  test("unsafe ids never reach the archive path", async () => {
    await Bun.write(
      join(dir, "planted.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "planted",
        root: sampleRoot,
        createdAt: "2026-05-01T00:00:00.000Z",
        archivedAt: "2026-05-02T00:00:00.000Z",
      }),
    );
    for (const id of ["../planted", "..", "a/b", "a\\b", ""]) {
      expect(await store.get(id)).toBeUndefined();
      expect(await store.purge(id)).toBe(false);
    }
    expect(await Bun.file(join(dir, "planted.json")).exists()).toBe(true);
  });

  test("list({ archived }) returns every record even past one read batch", async () => {
    await Promise.all(
      Array.from({ length: 70 }, (_, i) =>
        Bun.write(
          join(dir, "archive", `rec-${i}.json`),
          JSON.stringify({
            schemaVersion: 1,
            id: `rec-${i}`,
            root: sampleRoot,
            createdAt: "2026-05-01T00:00:00.000Z",
            archivedAt: "2026-05-02T00:00:00.000Z",
          }),
        ),
      ),
    );
    expect(await store.list({ archived: true })).toHaveLength(70);
  });

  test("a malformed archive record reads as absent instead of throwing", async () => {
    await Bun.write(join(dir, "archive", "broken.json"), "{not json");
    await Bun.write(
      join(dir, "archive", "no-archived-at.json"),
      JSON.stringify({ root: sampleRoot, createdAt: "2026-05-01T00:00:00.000Z" }),
    );
    expect(await store.get("broken")).toBeUndefined();
    expect(await store.get("no-archived-at")).toBeUndefined();
    expect(await store.list({ archived: true })).toEqual([]);
  });

  test("archive records strip since-removed node fields like the active read path", async () => {
    await Bun.write(
      join(dir, "archive", "legacy-arch.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "legacy-arch",
        root: { type: "Stack", props: {}, tags: ["x"] },
        createdAt: "2026-05-01T00:00:00.000Z",
        archivedAt: "2026-05-02T00:00:00.000Z",
        metadata: { source: "old" },
      }),
    );
    const got = await store.get("legacy-arch");
    expect(got?.archivedAt).toBe("2026-05-02T00:00:00.000Z");
    expect(got && "tags" in got.root).toBe(false);
    expect(got && "metadata" in got).toBe(false);
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

  test("update omitting title preserves the existing value instead of clearing it", async () => {
    await store.create({
      root: sampleRoot,
      title: "Day 1",
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

  const acceptAll = () => true;

  test("patch lands a conditional set on the item the label correspondence identifies", async () => {
    const env = await store.create({ root: checklistTree });
    const result = await store.patch(
      env.id,
      { nodeId: "todo", ...checkWriteback("b") },
      acceptAll,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const items = (
        result.envelope.root.children?.[0]?.props as {
          items: { checked?: boolean }[];
        }
      ).items;
      expect(items[0]?.checked).toBeUndefined();
      expect(items[1]?.checked).toBe(true);
    }
    const stored = await store.get(env.id);
    expect(
      (stored?.root.children?.[0]?.props as { items: unknown[] }).items[1],
    ).toEqual({ label: "b", checked: true });
  });

  test("patch follows the label through an LLM reorder, and occurrence picks among same-label items", async () => {
    const env = await store.create({
      idempotencyKey: "reorder",
      root: {
        type: "Stack",
        props: {},
        children: [
          {
            type: "Checklist",
            id: "todo",
            props: {
              items: [{ label: "same" }, { label: "same" }],
            },
          },
        ],
      },
    });
    // The LLM inserts an item at the front and inserts a third same-label item —
    // every index shifts; the label correspondence must not. expect.items carries
    // the post-update array the view rendered (the write is conditional on it).
    const items = [
      { label: "other" },
      { label: "same" },
      { label: "same" },
      { label: "same" },
    ];
    await store.update({
      idempotencyKey: "reorder",
      root: {
        type: "Stack",
        props: {},
        children: [
          {
            type: "Checklist",
            id: "todo",
            props: { items },
          },
        ],
      },
    });
    const result = await store.patch(
      env.id,
      { nodeId: "todo", ...checkWriteback("same", 2, { items }) },
      acceptAll,
    );
    expect(result.ok).toBe(true);
    const stored = await store.get(env.id);
    const storedItems = (
      stored?.root.children?.[0]?.props as {
        items: { label: string; checked?: boolean }[];
      }
    ).items;
    expect(storedItems[0]).toEqual({ label: "other" });
    expect(storedItems[1]).toEqual({ label: "same" });
    expect(storedItems[2]).toEqual({ label: "same", checked: true });
    expect(storedItems[3]).toEqual({ label: "same" });
  });

  test("patch persists across a store restart", async () => {
    const env = await store.create({ root: checklistTree });
    await store.patch(
      env.id,
      { nodeId: "todo", ...checkWriteback("a") },
      acceptAll,
    );
    const next = createSnapshotStore(dir);
    const got = await next.get(env.id);
    expect(
      (got?.root.children?.[0]?.props as { items: { checked?: boolean }[] })
        .items[0]?.checked,
    ).toBe(true);
  });

  test("patch tolerates a malformed stored tree — non-node elements don't throw", async () => {
    // On-disk trees aren't revalidated: a children array can hold non-nodes.
    const env = await store.create({
      root: {
        type: "Stack",
        props: {},
        children: [null as unknown as Item, checklistTree.children![0]!],
      },
    });
    const result = await store.patch(
      env.id,
      { nodeId: "todo", ...checkWriteback("a") },
      acceptAll,
    );
    expect(result.ok).toBe(true);
    const gone = await store.patch(
      env.id,
      { nodeId: "ghost", ...checkWriteback("a") },
      acceptAll,
    );
    expect(gone).toEqual({ ok: false, error: "node_not_found", nodeId: "ghost" });
  });

  test("patch returns not_found for a missing snapshot, node_not_found for a missing node id", async () => {
    const env = await store.create({ root: checklistTree });
    const missing = await store.patch(
      "missing",
      { nodeId: "todo", ...checkWriteback("a") },
      acceptAll,
    );
    expect(missing).toEqual({ ok: false, error: "not_found" });
    const gone = await store.patch(
      env.id,
      { nodeId: "gone", ...checkWriteback("a") },
      acceptAll,
    );
    expect(gone).toEqual({ ok: false, error: "node_not_found", nodeId: "gone" });
  });

  test("patch refuses an item the correspondence can't identify (target_not_found) — never redirecting to another item", async () => {
    const env = await store.create({
      root: {
        type: "Stack",
        props: {},
        children: [
          checklistTree.children![0]!,
          { type: "Heading", id: "head", props: { text: "no items" } },
        ],
      },
    });
    for (const input of [
      {
        nodeId: "todo",
        item: { label: "absent", occurrence: 1 }, // no such label
        expect: { items: [{ label: "a" }, { label: "b" }] },
      },
      {
        nodeId: "todo",
        item: { label: "a", occurrence: 2 }, // occurrence out of range
        expect: { items: [{ label: "a" }, { label: "b" }] },
      },
      {
        nodeId: "head",
        item: { label: "a", occurrence: 1 }, // node has no items array
        expect: { items: null }, // "items must be absent" — then nothing resolves
      },
    ]) {
      const result = await store.patch(
        env.id,
        { ...input, set: { checked: true } },
        acceptAll,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("target_not_found");
    }
    // A prototype-chain prop key is malformed on its own — invalid_set, not a miss.
    // (JSON.parse, not an object literal: a literal "__proto__" key sets the
    // prototype instead of becoming an own enumerable key.)
    const proto = await store.patch(
      env.id,
      {
        nodeId: "todo",
        item: { label: "a", occurrence: 1 },
        set: JSON.parse('{"__proto__":true,"checked":true}') as Record<
          string,
          unknown
        >,
        expect: {},
      },
      acceptAll,
    );
    expect(proto).toEqual({ ok: false, error: "invalid_set" });
    const stored = await store.get(env.id);
    const items = (stored?.root.children?.[0]?.props as { items: unknown[] })
      .items;
    expect(items[0]).toEqual({ label: "a" });
    expect(items[1]).toEqual({ label: "b" });
    expect(Object.prototype.hasOwnProperty.call({}, "x")).toBe(false);
  });

  test("patch refuses when the items array moved past expect (value_conflict)", async () => {
    const env = await store.create({ root: checklistTree });
    // Land checked:true first, then a stale write still expecting the old array.
    await store.patch(
      env.id,
      { nodeId: "todo", ...checkWriteback("a") },
      acceptAll,
    );
    const conflict = await store.patch(
      env.id,
      { nodeId: "todo", ...checkWriteback("a") }, // expect.items is the pre-write array
      acceptAll,
    );
    expect(conflict).toEqual({ ok: false, error: "value_conflict" });
    // And the value did not change a second time.
    const stored = await store.get(env.id);
    expect(
      (stored?.root.children?.[0]?.props as { items: { checked?: boolean }[] })
        .items[0]?.checked,
    ).toBe(true);
  });

  test("two parallel patches sharing one expect are serialized: the second refuses on the moved array", async () => {
    const env = await store.create({ root: checklistTree });
    const input = { nodeId: "todo", ...checkWriteback("a") };
    const [first, second] = await Promise.all([
      store.patch(env.id, input, acceptAll),
      store.patch(env.id, input, acceptAll),
    ]);
    // The write lock orders them; whichever runs second sees items already moved.
    const results = [first, second];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const refused = results.find((r) => !r.ok);
    expect(refused).toEqual({ ok: false, error: "value_conflict" });
  });

  test("patch refuses when a same-label insertion shifted occurrences — the CAS catches what label+occurrence cannot", async () => {
    // CodeRabbit scenario: the view rendered [{x},{x}] and the user checks the
    // first x (occurrence 1). An external update inserts another x at the front;
    // occurrence 1 now resolves to the inserted item — but expect.items no
    // longer matches, so the write must be refused instead of landing wrong.
    const rendered = [{ label: "x" }, { label: "x" }];
    const env = await store.create({
      idempotencyKey: "dup",
      root: {
        type: "Stack",
        props: {},
        children: [
          { type: "Checklist", id: "todo", props: { items: rendered } },
        ],
      },
    });
    await store.update({
      idempotencyKey: "dup",
      root: {
        type: "Stack",
        props: {},
        children: [
          {
            type: "Checklist",
            id: "todo",
            props: { items: [{ label: "x" }, ...rendered] },
          },
        ],
      },
    });
    const result = await store.patch(
      env.id,
      {
        nodeId: "todo",
        item: { label: "x", occurrence: 1 },
        set: { checked: true },
        expect: { items: rendered },
      },
      acceptAll,
    );
    expect(result).toEqual({ ok: false, error: "value_conflict" });
    const stored = await store.get(env.id);
    expect(
      (
        stored?.root.children?.[0]?.props as {
          items: { checked?: boolean }[];
        }
      ).items.every((i) => i.checked === undefined),
    ).toBe(true);
  });

  test("patch refuses a schema-breaking value (invalid_set) leaving the tree untouched", async () => {
    const env = await store.create({ root: checklistTree });
    const rejected = await store.patch(
      env.id,
      {
        nodeId: "todo",
        item: { label: "a", occurrence: 1 },
        set: { checked: "yes" }, // a string can never satisfy the boolean schema
        expect: { items: [{ label: "a" }, { label: "b" }] },
      },
      () => false, // validator rejects — as the node's propsSchema would for a string `checked`
    );
    expect(rejected).toEqual({ ok: false, error: "invalid_set" });
    const stored = await store.get(env.id);
    expect(
      (stored?.root.children?.[0]?.props as { items: unknown[] }).items[0],
    ).toEqual({ label: "a" });
  });

  test("patch applies several set entries in one write", async () => {
    const env = await store.create({ root: checklistTree });
    const result = await store.patch(
      env.id,
      {
        nodeId: "todo",
        item: { label: "a", occurrence: 1 },
        set: { checked: true, note: "done" },
        expect: { items: [{ label: "a" }, { label: "b" }] },
      },
      acceptAll,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const items = (
        result.envelope.root.children?.[0]?.props as {
          items: { label: string; checked?: boolean; note?: string }[];
        }
      ).items;
      expect(items[0]).toEqual({ label: "a", checked: true, note: "done" });
    }
  });

  test("subscribers are notified once per mutation with the snapshot id and kind", async () => {
    const seen: { id: string; kind: string }[] = [];
    const unsubscribe = store.subscribe((change) => seen.push(change));

    const env = await store.create({ root: checklistTree, idempotencyKey: "k" });
    // a deduped create is not a mutation — it must not notify
    await store.create({ root: checklistTree, idempotencyKey: "k" });
    await store.update({ root: checklistTree, idempotencyKey: "k" });
    await store.patch(
      env.id,
      { nodeId: "todo", ...checkWriteback("a") },
      acceptAll,
    );
    await store.delete(env.id);

    expect(seen).toEqual([
      { id: env.id, kind: "create" },
      { id: env.id, kind: "update" },
      { id: env.id, kind: "patch" },
      { id: env.id, kind: "delete" },
    ]);

    unsubscribe();
    await store.create({ root: sampleRoot });
    expect(seen.length).toBe(4);
  });
});
