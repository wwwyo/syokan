import { mkdir, open, readdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJsonAtomic } from "../src/lib/fsAtomic";
import { isRecord, jsonEqual } from "../src/lib/json";
import { indexOfLabelOccurrence } from "../src/lib/labelOccurrence";
import {
  CURRENT_SCHEMA_VERSION,
  findItem,
  type Item,
  type SnapshotEnvelope,
  type SnapshotPatchInput,
  type SnapshotSummary,
} from "../src/schema";

// Envelopes persisted before archiving existed carry no archivedAt; active entries are
// null either way, and buildEnvelope projects the field onto every response.
type StoredEnvelope = Omit<SnapshotEnvelope, "archivedAt"> & {
  archivedAt?: string | null;
};

type StoreFile = {
  snapshots: Record<string, StoredEnvelope>;
  // key→id outlives the active snapshot: an archived id stays registered so a later post
  // with the same key revives it under the same id/URL.
  idempotency: Record<string, string>;
};

export type CreateInput = {
  title?: string;
  root: Item;
  // When set, registers key→id separately from id/url and makes it the target of later updates.
  // Passing an already-registered key returns the existing one as-is instead of creating (dedup) —
  // even if the CLI's PUT→404→POST fallback runs concurrently, this dedup takes effect inside the
  // enqueue+withLock that serializes read-modify-write, so no orphan snapshots accumulate.
  // A key whose id is no longer active (archived) revives that id with the posted content.
  idempotencyKey?: string;
};

export type UpdateInput = {
  title?: string;
  root: Item;
  idempotencyKey: string;
};

export type UpdateResult =
  | { ok: true; envelope: SnapshotEnvelope }
  | { ok: false; error: "not_found" };

export type PatchResult =
  | { ok: true; envelope: SnapshotEnvelope }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "node_not_found"; nodeId: string }
  | { ok: false; error: "target_not_found" }
  | { ok: false; error: "value_conflict" }
  | { ok: false; error: "invalid_set" };

// Emitted to subscribers after a store mutation lands (in-process only — mutations
// written by another process are visible via read-through but never pushed here).
export type SnapshotChange = {
  id: string;
  kind: "create" | "update" | "delete" | "patch";
};

export type SnapshotStore = {
  // Create anew. If idempotencyKey is already registered, return the existing one instead of creating (dedup).
  create: (input: CreateInput) => Promise<SnapshotEnvelope>;
  // Replace the existing snapshot identified by idempotencyKey (keeping id/url/createdAt).
  // not_found if there's no match (AIP-134's Update default; there's no allow_missing —
  // use create when you want to create anew. So that a missed target never silently creates,
  // update never breaks its "must already exist" premise).
  update: (input: UpdateInput) => Promise<UpdateResult>;
  // Write a node-scoped edit (view writeback) into the latest tree inside the write lock,
  // so a concurrent PUT can't lose it or be rolled back by it. The set is conditional —
  // it lands only when the node's props still match `expect` and the addressed item
  // resolves by the label correspondence — and `validate` gates the write on the
  // mutated node's props (routes.ts checks them against the node's catalog schema).
  patch: (
    id: string,
    input: SnapshotPatchInput,
    validate: (node: Item) => boolean,
  ) => Promise<PatchResult>;
  // Resolves the active snapshot first, then the archive record (archivedAt set).
  get: (id: string) => Promise<SnapshotEnvelope | undefined>;
  // Active snapshots by default; `archived` lists the archive records instead.
  list: (options?: { archived?: boolean }) => Promise<SnapshotSummary[]>;
  // Archive: copy the envelope to the archive (overwriting an older record) and drop it
  // from the active store. false when there is no active snapshot.
  delete: (id: string) => Promise<boolean>;
  // Physically remove the archive record. false when there is none; the active store is untouched.
  purge: (id: string) => Promise<boolean>;
  // Subscribe to mutations issued through this store instance. Returns the unsubscribe.
  subscribe: (listener: (change: SnapshotChange) => void) => () => void;
};

// Old JSON files on disk are read without schema revalidation (read() below just
// JSON.parses them), so a field removed from the schema (e.g. `tags`, dropped with
// TagFilter) can otherwise ride back into API/UI responses forever. Recursively strip
// it from every node on every read path (get() and the create() dedup-return) so
// responses always match the current shape. The stored file is left as-is: snapshots
// are ephemeral, so rewriting them at read time buys nothing a projection doesn't.
function stripLegacyNodeFields(item: Item): Item {
  // A stored tree's children aren't revalidated — pass malformed elements
  // through untouched so the traversal (findItem) can skip them itself.
  if (!isRecord(item)) return item;
  const { tags: _legacyTags, ...rest } = item as Item & { tags?: unknown };
  const copy = rest as Item;
  // On-disk snapshots are parsed without revalidation (that is why this function exists),
  // so children may be any shape. Recurse only into a real array; drop anything else
  // rather than throwing and turning a read into a 500.
  if (copy.children !== undefined) {
    if (Array.isArray(copy.children)) {
      copy.children = copy.children.map(stripLegacyNodeFields);
    } else {
      delete copy.children;
    }
  }
  return copy;
}

const LOCK_TIMEOUT_MS = 5_000;

// A set map walks item prop keys. Never let a write walk the prototype chain.
export const FORBIDDEN_PROP_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

// Archive paths are built from the route's :id (external input), so an id must be one plain
// path component — no separators, no dot-segments — before it reaches join(). Ids are minted by
// crypto.randomUUID(), but the lookup side must not lean on the generator's shape.
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const ARCHIVE_EXT = ".json";
const ARCHIVE_READ_BATCH = 32;

export function createSnapshotStore(
  dataDir: string,
  archiveDir: string = join(dataDir, "archive"),
): SnapshotStore {
  const file = join(dataDir, "snapshots.json");
  const lockFile = `${file}.lock`;

  // undefined = the id can't name an archive record (treated as "not archived").
  function archiveFile(id: string): string | undefined {
    return SAFE_ID.test(id) ? join(archiveDir, `${id}${ARCHIVE_EXT}`) : undefined;
  }

  // Archive records are read without schema revalidation, like the active store; a record
  // that isn't envelope-shaped (hand-edited, truncated) counts as absent instead of a 500.
  async function readArchive(id: string): Promise<SnapshotEnvelope | undefined> {
    const path = archiveFile(id);
    if (!path) return undefined;
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw err;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return undefined;
    }
    if (
      !isRecord(parsed) ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.archivedAt !== "string" ||
      !isRecord(parsed.root)
    ) {
      return undefined;
    }
    const env = parsed as unknown as StoredEnvelope;
    return buildEnvelope(
      id,
      env.createdAt,
      env.root,
      env.title,
      parsed.archivedAt,
    );
  }

  // Serialize writes (create/delete) within one process (in-process mutex).
  // Prevents idempotency violations / lost updates from interleaved read-modify-write.
  let writeChain: Promise<unknown> = Promise.resolve();

  // In-process mutation subscribers (drives the SSE change notification). Not persisted.
  const listeners = new Set<(change: SnapshotChange) => void>();

  // Called only after a mutation has been written. A throwing listener must never
  // break the write path.
  function notify(change: SnapshotChange): void {
    for (const listener of listeners) {
      try {
        listener(change);
      } catch {
        // listener bugs are their own problem
      }
    }
  }

  function subscribe(
    listener: (change: SnapshotChange) => void,
  ): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      // EPERM = exists but no permission → treat as alive (don't reclaim)
      return (err as NodeJS.ErrnoException).code === "EPERM";
    }
  }

  // Reclaim only a lock whose owner process is dead. The return value is "may the acquisition
  // be retried" (removed / already gone = true, still alive = false).
  async function reclaimIfDead(): Promise<boolean> {
    let raw: string;
    try {
      raw = await readFile(lockFile, "utf8");
    } catch {
      return true; // already gone → retry acquisition
    }
    const pid = Number.parseInt(raw.split(":")[0] ?? "", 10);
    if (Number.isFinite(pid) && pid > 0 && isProcessAlive(pid)) {
      return false; // owner alive → don't reclaim, wait
    }
    // Crashed owner (or malformed content). Remove only when it matches what we read
    // (don't remove if a live process re-acquired it in the meantime).
    try {
      if ((await readFile(lockFile, "utf8")) === raw) {
        await rm(lockFile, { force: true });
      }
    } catch {
      // already gone
    }
    return true;
  }

  async function releaseLock(content: string): Promise<void> {
    try {
      if ((await readFile(lockFile, "utf8")) === content) {
        await rm(lockFile, { force: true });
      }
    } catch {
      // already gone / unreadable → do nothing
    }
  }

  // Cross-process exclusion. lazy-spawn can wake another server process pointing at the same
  // data dir, so an in-process mutex alone lets a lost update slip through across processes.
  // Use an O_EXCL lock file as the mutex.
  //
  // Staleness is judged by "the owner process being alive", not by "elapsed time".
  // Reclaiming by elapsed time would seize a slow writer's lock (a large write / swap) mid-critical
  // section and reintroduce lost updates. Never reclaim while the owner is alive; reclaim only on a
  // crash (the pid no longer exists). Write `pid:token` to the lock file, and release / reclaim rm
  // only on a content match, so another process's lock is never removed.
  async function withLock<T>(fn: () => Promise<T>): Promise<T> {
    await mkdir(dirname(file), { recursive: true });
    const content = `${process.pid}:${crypto.randomUUID()}`;
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
      try {
        const handle = await open(lockFile, "wx");
        try {
          await handle.writeFile(content);
        } finally {
          await handle.close();
        }
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
        if (await reclaimIfDead()) continue;
        if (Date.now() > deadline) {
          throw new Error("SnapshotStore: lock acquisition timed out");
        }
        await new Promise((resolve) =>
          setTimeout(resolve, 20 + Math.random() * 30),
        );
      }
    }
    try {
      return await fn();
    } finally {
      await releaseLock(content);
    }
  }

  // Read from disk every time. With no in-memory cache, changes written by another process
  // (a lazy-spawned server / a separate dev server) are always reflected.
  //
  // Make the map null-prototype. ids come from URL paths (attacker-controlled), and with a
  // plain object `snapshots["constructor"]` etc. would return Object.prototype functions,
  // slipping past the `!env` guard and making `"toString" in snapshots` true. With null-proto,
  // lookup / `in` see only own keys, so get / delete / idempotency lookups are all made safe at once.
  async function read(): Promise<StoreFile> {
    try {
      const text = await readFile(file, "utf8");
      const parsed = JSON.parse(text) as Partial<StoreFile>;
      return {
        snapshots: Object.assign(Object.create(null), parsed.snapshots),
        idempotency: Object.assign(Object.create(null), parsed.idempotency),
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      return {
        snapshots: Object.create(null),
        idempotency: Object.create(null),
      };
    }
  }

  function write(data: StoreFile): Promise<void> {
    return writeJsonAtomic(file, data);
  }

  // Wait for the previous write to finish before running fn (in-process mutex).
  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = writeChain.then(fn, fn);
    // Don't propagate success/failure to the chain (one failure doesn't halt what follows)
    writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  // Build the envelope from id/createdAt/title (shared by create/update).
  // Falling back title to base (undefined on create, the existing value on update)
  // keeps update from clearing fields that were omitted.
  function buildEnvelope(
    id: string,
    createdAt: string,
    root: Item,
    title: string | undefined,
    archivedAt: string | null = null,
  ): SnapshotEnvelope {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id,
      root: stripLegacyNodeFields(root),
      createdAt,
      ...(title !== undefined ? { title } : {}),
      archivedAt,
    };
  }

  function create(input: CreateInput): Promise<SnapshotEnvelope> {
    return enqueue(() =>
      withLock(async () => {
        const data = await read();
        const registeredId = input.idempotencyKey
          ? data.idempotency[input.idempotencyKey]
          : undefined;
        const existing = registeredId ? data.snapshots[registeredId] : undefined;
        // Re-project through buildEnvelope: snapshots persisted by older versions may
        // carry since-removed fields (e.g. metadata), which must not leak into responses.
        if (existing) {
          return buildEnvelope(
            existing.id,
            existing.createdAt,
            existing.root,
            existing.title,
          );
        }
        // A registered key without an active snapshot = archived: revive under the same
        // id/URL with the posted content. The archive record is left as it is.
        const id = registeredId ?? crypto.randomUUID();
        const envelope = buildEnvelope(
          id,
          new Date().toISOString(),
          input.root,
          input.title,
        );
        data.snapshots[id] = envelope;
        if (input.idempotencyKey) {
          data.idempotency[input.idempotencyKey] = id;
        }
        await write(data);
        notify({ id, kind: "create" });
        return envelope;
      }),
    );
  }

  function update(input: UpdateInput): Promise<UpdateResult> {
    return enqueue(() =>
      withLock(async () => {
        const data = await read();
        const existingId = data.idempotency[input.idempotencyKey];
        const existing = existingId ? data.snapshots[existingId] : undefined;
        if (!existing) return { ok: false, error: "not_found" };
        // Replace while keeping the same id/url/createdAt. If title is
        // omitted, keep the existing value (updating only root via PUT doesn't clear it).
        const envelope = buildEnvelope(
          existing.id,
          existing.createdAt,
          input.root,
          input.title ?? existing.title,
        );
        data.snapshots[envelope.id] = envelope;
        await write(data);
        notify({ id: envelope.id, kind: "update" });
        return { ok: true, envelope };
      }),
    );
  }

  function patch(
    id: string,
    input: SnapshotPatchInput,
    validate: (node: Item) => boolean,
  ): Promise<PatchResult> {
    return enqueue(() =>
      withLock(async () => {
        const data = await read();
        const existing = data.snapshots[id];
        if (!existing) return { ok: false, error: "not_found" };
        // Reproject first: fields removed from the schema (e.g. `tags`) ride along
        // in stored trees but must not count as schema violations. The reprojected
        // tree is fresh — nothing retains it on a refusal, and `data` is discarded
        // unwritten, so mutating it in place is unobservable.
        const root = stripLegacyNodeFields(existing.root);
        const node = findItem(root, (item) => item.id === input.nodeId);
        if (!node) {
          return { ok: false, error: "node_not_found", nodeId: input.nodeId };
        }
        // The prop preconditions first: a Checklist asserts the whole `items`
        // array it rendered (compare-and-set). If it still matches, the label
        // correspondence resolves deterministically below; if it drifted — a
        // same-label insertion included — the write is refused as a conflict.
        const props = isRecord(node.props) ? node.props : {};
        for (const [key, expected] of Object.entries(input.expect)) {
          const current = Object.hasOwn(props, key) ? props[key] : undefined;
          if (!jsonEqual(current ?? null, expected)) {
            return { ok: false, error: "value_conflict" };
          }
        }
        // A stored tree isn't revalidated, so items may be a malformed shape — any
        // of these is simply "the item can't be identified", never a partial write.
        let target: unknown;
        const items = props.items;
        if (Array.isArray(items)) {
          const index = indexOfLabelOccurrence(
            items,
            input.item.label,
            input.item.occurrence,
          );
          if (index !== -1) target = items[index];
        }
        if (!isRecord(target)) {
          return { ok: false, error: "target_not_found" };
        }
        for (const key of Object.keys(input.set)) {
          if (FORBIDDEN_PROP_KEYS.has(key)) {
            return { ok: false, error: "invalid_set" };
          }
        }
        for (const [key, value] of Object.entries(input.set)) {
          target[key] = value;
        }
        if (!validate(node)) {
          return { ok: false, error: "invalid_set" };
        }
        existing.root = root;
        await write(data);
        notify({ id: existing.id, kind: "patch" });
        return {
          ok: true,
          envelope: buildEnvelope(
            existing.id,
            existing.createdAt,
            existing.root,
            existing.title,
          ),
        };
      }),
    );
  }

  // Active wins over an archive record of the same id (a revived snapshot): GET returns the
  // resource's current form, and the archive is only the fallback.
  async function get(id: string): Promise<SnapshotEnvelope | undefined> {
    const data = await read();
    const env = data.snapshots[id];
    // Same projection as the dedup path: strip fields removed from the envelope schema.
    if (env) return buildEnvelope(env.id, env.createdAt, env.root, env.title);
    return readArchive(id);
  }

  async function listArchived(): Promise<SnapshotEnvelope[]> {
    let names: string[];
    try {
      names = await readdir(archiveDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const ids = names
      .filter((name) => name.endsWith(ARCHIVE_EXT))
      .map((name) => name.slice(0, -ARCHIVE_EXT.length));
    // The archive grows until an explicit purge, so reading every record at once could
    // exhaust file descriptors; read in fixed-size batches.
    const envs: SnapshotEnvelope[] = [];
    for (let i = 0; i < ids.length; i += ARCHIVE_READ_BATCH) {
      const batch = await Promise.all(
        ids.slice(i, i + ARCHIVE_READ_BATCH).map(readArchive),
      );
      for (const env of batch) if (env) envs.push(env);
    }
    return envs;
  }

  async function list(
    options: { archived?: boolean } = {},
  ): Promise<SnapshotSummary[]> {
    const envs: StoredEnvelope[] = options.archived
      ? await listArchived()
      : Object.values((await read()).snapshots);
    const items = envs.map((env) => {
      const summary: SnapshotSummary = {
        id: env.id,
        createdAt: env.createdAt,
        archivedAt: env.archivedAt ?? null,
      };
      if (env.title !== undefined) summary.title = env.title;
      return summary;
    });
    // Newest first. Stabilize ties with a total-order comparison (localeCompare) that returns 0 for equal values.
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }

  // The archive record is written before the active entry is dropped, so a crash in between
  // leaves both (active wins on read) rather than neither. The idempotency key stays
  // registered so the same key revives this id.
  function remove(id: string): Promise<boolean> {
    return enqueue(() =>
      withLock(async () => {
        const data = await read();
        const env = data.snapshots[id];
        const path = archiveFile(id);
        if (!env || !path) return false;
        await writeJsonAtomic(
          path,
          buildEnvelope(
            id,
            env.createdAt,
            env.root,
            env.title,
            new Date().toISOString(),
          ),
        );
        delete data.snapshots[id];
        await write(data);
        notify({ id, kind: "delete" });
        return true;
      }),
    );
  }

  // Under the write lock so it can't interleave with an archive overwriting the same record.
  // A key left pointing at a purged, inactive id is dropped: nothing remains to revive.
  function purge(id: string): Promise<boolean> {
    return enqueue(() =>
      withLock(async () => {
        const path = archiveFile(id);
        if (!path) return false;
        try {
          await rm(path);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
          throw err;
        }
        const data = await read();
        if (!(id in data.snapshots)) {
          const stale = Object.keys(data.idempotency).filter(
            (key) => data.idempotency[key] === id,
          );
          if (stale.length > 0) {
            for (const key of stale) delete data.idempotency[key];
            await write(data);
          }
        }
        return true;
      }),
    );
  }

  return { create, update, patch, get, list, delete: remove, purge, subscribe };
}
