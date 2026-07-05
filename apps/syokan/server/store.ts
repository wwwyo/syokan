import { mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJsonAtomic } from "@/lib/fsAtomic";
import {
  CURRENT_SCHEMA_VERSION,
  type Item,
  type SnapshotEnvelope,
  type SnapshotMetadata,
  type SnapshotSummary,
} from "@/schema";

type StoreFile = {
  snapshots: Record<string, SnapshotEnvelope>;
  idempotency: Record<string, string>;
};

export type CreateInput = {
  title?: string;
  root: Item;
  metadata?: SnapshotMetadata;
  // When set, registers key→id separately from id/url and makes it the target of later updates.
  // Passing an already-registered key returns the existing one as-is instead of creating (dedup) —
  // even if the CLI's PUT→404→POST fallback runs concurrently, this dedup takes effect inside the
  // enqueue+withLock that serializes read-modify-write, so no orphan snapshots accumulate.
  idempotencyKey?: string;
};

export type UpdateInput = {
  title?: string;
  root: Item;
  metadata?: SnapshotMetadata;
  idempotencyKey: string;
};

export type UpdateResult =
  | { ok: true; envelope: SnapshotEnvelope }
  | { ok: false; error: "not_found" };

export type SnapshotStore = {
  // Create anew. If idempotencyKey is already registered, return the existing one instead of creating (dedup).
  create: (input: CreateInput) => Promise<SnapshotEnvelope>;
  // Replace the existing snapshot identified by idempotencyKey (keeping id/url/createdAt).
  // not_found if there's no match (AIP-134's Update default; there's no allow_missing —
  // use create when you want to create anew. So that a missed target never silently creates,
  // update never breaks its "must already exist" premise).
  update: (input: UpdateInput) => Promise<UpdateResult>;
  get: (id: string) => Promise<SnapshotEnvelope | undefined>;
  list: () => Promise<SnapshotSummary[]>;
  delete: (id: string) => Promise<boolean>;
};

const LOCK_TIMEOUT_MS = 5_000;

export function createSnapshotStore(dataDir: string): SnapshotStore {
  const file = join(dataDir, "snapshots.json");
  const lockFile = `${file}.lock`;
  // Serialize writes (create/delete) within one process (in-process mutex).
  // Prevents idempotency violations / lost updates from interleaved read-modify-write.
  let writeChain: Promise<unknown> = Promise.resolve();

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

  // Build the envelope from id/createdAt/title/metadata (shared by create/update).
  // Falling back title/metadata to base (undefined on create, the existing value on update)
  // keeps update from clearing fields that were omitted.
  function buildEnvelope(
    id: string,
    createdAt: string,
    root: Item,
    title: string | undefined,
    metadata: SnapshotMetadata | undefined,
  ): SnapshotEnvelope {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id,
      root,
      createdAt,
      ...(title !== undefined ? { title } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
    };
  }

  function create(input: CreateInput): Promise<SnapshotEnvelope> {
    return enqueue(() =>
      withLock(async () => {
        const data = await read();
        if (input.idempotencyKey) {
          const existingId = data.idempotency[input.idempotencyKey];
          const existing = existingId ? data.snapshots[existingId] : undefined;
          if (existing) return existing;
        }
        const id = crypto.randomUUID();
        const envelope = buildEnvelope(
          id,
          new Date().toISOString(),
          input.root,
          input.title,
          input.metadata,
        );
        data.snapshots[id] = envelope;
        if (input.idempotencyKey) {
          data.idempotency[input.idempotencyKey] = id;
        }
        await write(data);
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
        // Replace while keeping the same id/url/createdAt. If title/metadata are
        // omitted, keep the existing values (updating only root via PUT doesn't clear them).
        const envelope = buildEnvelope(
          existing.id,
          existing.createdAt,
          input.root,
          input.title ?? existing.title,
          input.metadata ?? existing.metadata,
        );
        data.snapshots[envelope.id] = envelope;
        await write(data);
        return { ok: true, envelope };
      }),
    );
  }

  async function get(id: string): Promise<SnapshotEnvelope | undefined> {
    const data = await read();
    return data.snapshots[id];
  }

  async function list(): Promise<SnapshotSummary[]> {
    const data = await read();
    const items = Object.values(data.snapshots).map((env) => {
      const summary: SnapshotSummary = {
        id: env.id,
        createdAt: env.createdAt,
      };
      if (env.title !== undefined) summary.title = env.title;
      const label = env.metadata?.source?.label;
      if (label) summary.source = { label };
      return summary;
    });
    // Newest first. Stabilize ties with a total-order comparison (localeCompare) that returns 0 for equal values.
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }

  function remove(id: string): Promise<boolean> {
    return enqueue(() =>
      withLock(async () => {
        const data = await read();
        if (!(id in data.snapshots)) return false;
        delete data.snapshots[id];
        for (const key of Object.keys(data.idempotency)) {
          if (data.idempotency[key] === id) delete data.idempotency[key];
        }
        await write(data);
        return true;
      }),
    );
  }

  return { create, update, get, list, delete: remove };
}
