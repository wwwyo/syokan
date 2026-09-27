import { mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJsonAtomic } from "../src/lib/fsAtomic";
import { jsonEqual } from "../src/lib/json";
import {
  CURRENT_SCHEMA_VERSION,
  type Item,
  type SnapshotEnvelope,
  type SnapshotSummary,
} from "../src/schema";

type StoreFile = {
  snapshots: Record<string, SnapshotEnvelope>;
  idempotency: Record<string, string>;
};

export type CreateInput = {
  title?: string;
  root: Item;
  // When set, registers key→id separately from id/url and makes it the target of later updates.
  // Passing an already-registered key returns the existing one as-is instead of creating (dedup) —
  // even if the CLI's PUT→404→POST fallback runs concurrently, this dedup takes effect inside the
  // enqueue+withLock that serializes read-modify-write, so no orphan snapshots accumulate.
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

// A writeback path segment: a string walks an object key; a label matcher resolves an
// array element by the node-identity correspondence — the element whose `label`
// deep-equals, counting occurrences of that same label (nth, 1-based). There is no
// index addressing: an index silently follows an LLM's insert/delete/reorder and
// points at a different item undetected, while a broken label correspondence
// surfaces as target_not_found and can be refused.
export type PatchPathSegment = string | { label: unknown; nth: number };

export type PatchSetEntry = {
  // A path into the node's props (e.g. ["items", { label: "x", nth: 1 }, "checked"]).
  path: PatchPathSegment[];
  // The condition: the write applies only when the value currently at `path`
  // deep-equals `expect` (the value the view rendered before the operation). An
  // absent location only matches expect=undefined.
  expect: unknown;
  value: unknown;
};

export type PatchInput = {
  // The writeback target: a node carrying this id in the tree.
  nodeId: string;
  set: PatchSetEntry[];
};

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
  // it lands only when the addressed target exists by the label correspondence and its
  // current value matches `expect` — and `validate` gates the write on the post-set
  // root (routes.ts checks the whole tree against the catalog itemSchema).
  patch: (
    id: string,
    input: PatchInput,
    validate: (root: Item) => boolean,
  ) => Promise<PatchResult>;
  get: (id: string) => Promise<SnapshotEnvelope | undefined>;
  list: () => Promise<SnapshotSummary[]>;
  delete: (id: string) => Promise<boolean>;
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

// A set path walks object keys and label correspondences. Never let a lookup/write
// walk the prototype chain.
const FORBIDDEN_PATH_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The index of the nth (1-based) array element whose `label` deep-equals the
// matcher's — the node-identity correspondence for Checklist items — or -1 when
// fewer than nth elements carry that label.
function labelIndex(
  array: unknown[],
  matcher: { label: unknown; nth: number },
): number {
  let seen = 0;
  for (let i = 0; i < array.length; i++) {
    const element = array[i];
    if (isPlainRecord(element) && jsonEqual(element.label, matcher.label)) {
      seen++;
      if (seen === matcher.nth) return i;
    }
  }
  return -1;
}

// Resolve `entry.path` inside `props` to the leaf location (holder + key to set).
// Every segment must resolve — no implicit structure creation — so a path that no
// longer matches anything in the latest tree is a miss (the identification
// condition failed: the view's writeback is refused, never redirected). A path
// that is malformed on its own — a forbidden key — is invalid regardless of state.
function resolvePatchTarget(
  props: Record<string, unknown>,
  path: PatchPathSegment[],
): { holder: unknown[] | Record<string, unknown>; key: number | string } | "miss" | "invalid" {
  let target: unknown = props;
  for (const segment of path.slice(0, -1)) {
    const next = stepInto(target, segment);
    if (next === PATCH_MISS) return "miss";
    if (next === PATCH_INVALID) return "invalid";
    target = next;
    if (typeof target !== "object" || target === null) return "miss";
  }
  const leaf = path[path.length - 1] as PatchPathSegment;
  if (typeof leaf === "string") {
    if (FORBIDDEN_PATH_SEGMENTS.has(leaf)) return "invalid";
    if (!isPlainRecord(target)) return "miss";
    return { holder: target, key: leaf };
  }
  if (!Array.isArray(target)) return "miss";
  const index = labelIndex(target, leaf);
  if (index === -1) return "miss";
  return { holder: target, key: index };
}

const PATCH_MISS: unique symbol = Symbol("patch-miss");
const PATCH_INVALID: unique symbol = Symbol("patch-invalid");

function stepInto(target: unknown, segment: PatchPathSegment): unknown {
  if (typeof segment === "string") {
    if (FORBIDDEN_PATH_SEGMENTS.has(segment)) return PATCH_INVALID;
    if (!isPlainRecord(target)) return PATCH_MISS;
    return target[segment];
  }
  if (!Array.isArray(target)) return PATCH_MISS;
  const index = labelIndex(target, segment);
  return index === -1 ? PATCH_MISS : target[index];
}

// One conditional set: `expect` must deep-equal the current value (the tree may
// have moved under the view — an external PUT — in which case the writeback no
// longer applies and must not silently land on changed data).
function applyPatchEntry(
  props: Record<string, unknown>,
  entry: PatchSetEntry,
): "ok" | "target_not_found" | "value_conflict" | "invalid_set" {
  if (entry.path.length === 0) return "invalid_set";
  const location = resolvePatchTarget(props, entry.path);
  if (location === "invalid") return "invalid_set";
  if (location === "miss") return "target_not_found";
  const { holder, key } = location;
  const current = Array.isArray(holder)
    ? holder[key as number]
    : holder[key as string];
  if (!jsonEqual(current, entry.expect)) return "value_conflict";
  if (Array.isArray(holder)) holder[key as number] = entry.value;
  else holder[key as string] = entry.value;
  return "ok";
}

function findNodeById(root: Item, id: string): Item | undefined {
  const stack: Item[] = [root];
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) break;
    if (item.id === id) return item;
    // On-disk trees are not revalidated, so children may be a malformed shape.
    if (Array.isArray(item.children)) stack.push(...item.children);
  }
  return undefined;
}

export function createSnapshotStore(dataDir: string): SnapshotStore {
  const file = join(dataDir, "snapshots.json");
  const lockFile = `${file}.lock`;
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
  ): SnapshotEnvelope {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id,
      root: stripLegacyNodeFields(root),
      createdAt,
      ...(title !== undefined ? { title } : {}),
    };
  }

  function create(input: CreateInput): Promise<SnapshotEnvelope> {
    return enqueue(() =>
      withLock(async () => {
        const data = await read();
        if (input.idempotencyKey) {
          const existingId = data.idempotency[input.idempotencyKey];
          const existing = existingId ? data.snapshots[existingId] : undefined;
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
        }
        const id = crypto.randomUUID();
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
    input: PatchInput,
    validate: (root: Item) => boolean,
  ): Promise<PatchResult> {
    return enqueue(() =>
      withLock(async () => {
        const data = await read();
        const existing = data.snapshots[id];
        if (!existing) return { ok: false, error: "not_found" };
        // Apply onto a clone: a refused set or a failed schema check leaves the
        // stored tree untouched.
        const root = structuredClone(existing.root);
        const node = findNodeById(root, input.nodeId);
        if (!node) return { ok: false, error: "node_not_found", nodeId: input.nodeId };
        // A stored tree isn't revalidated, so a node may carry a malformed props.
        if (!isPlainRecord(node.props)) node.props = {};
        for (const entry of input.set) {
          const outcome = applyPatchEntry(node.props, entry);
          if (outcome !== "ok") return { ok: false, error: outcome };
        }
        // Reproject before validating: fields removed from the schema (e.g. `tags`)
        // ride along in stored trees but must not count as schema violations here.
        const cleanRoot = stripLegacyNodeFields(root);
        if (!validate(cleanRoot)) {
          return { ok: false, error: "invalid_set" };
        }
        existing.root = cleanRoot;
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

  async function get(id: string): Promise<SnapshotEnvelope | undefined> {
    const data = await read();
    const env = data.snapshots[id];
    if (!env) return undefined;
    // Same projection as the dedup path: strip fields removed from the envelope schema.
    return buildEnvelope(env.id, env.createdAt, env.root, env.title);
  }

  async function list(): Promise<SnapshotSummary[]> {
    const data = await read();
    const items = Object.values(data.snapshots).map((env) => {
      const summary: SnapshotSummary = {
        id: env.id,
        createdAt: env.createdAt,
      };
      if (env.title !== undefined) summary.title = env.title;
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
        notify({ id, kind: "delete" });
        return true;
      }),
    );
  }

  return { create, update, patch, get, list, delete: remove, subscribe };
}
