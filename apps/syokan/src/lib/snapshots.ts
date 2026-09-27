import type { SnapshotEnvelope, SnapshotSummary } from "../schema";

/**
 * Decide the "open next" id after deleting a snapshot from the list (newest first).
 * The item right after the deleted position → else the one right before → else null (= back to home).
 */
export function nextSnapshotId(
  items: readonly { id: string }[],
  deletedId: string,
): string | null {
  const i = items.findIndex((v) => v.id === deletedId);
  if (i === -1) return null;
  return items[i + 1]?.id ?? items[i - 1]?.id ?? null;
}

/** Fetch a single snapshot. 404 → null, other failures → throw (the route loader routes to error display). */
export async function fetchSnapshotEnvelope(
  id: string,
): Promise<SnapshotEnvelope | null> {
  const res = await fetch(`/api/snapshots/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as SnapshotEnvelope;
}

/** Fetch the snapshot list. Failures throw (the caller swallows it into an error state). */
export async function fetchSnapshotList(): Promise<SnapshotSummary[]> {
  const res = await fetch("/api/snapshots");
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const data = (await res.json()) as { items: SnapshotSummary[] };
  return data.items;
}

/** Delete a snapshot. Already gone (404) also counts as success (idempotent). A network drop returns false. */
export async function deleteSnapshot(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/snapshots/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return res.ok || res.status === 404;
  } catch {
    // Swallow a fetch reject (offline, etc.) into false so the caller's floating promise
    // does not become an unhandled rejection (the UI can treat it as "failed").
    return false;
  }
}

// A writeback path: string keys walk objects; a { label, nth } matcher resolves the
// nth same-label array element (the node-identity item correspondence — an index
// would silently follow an LLM insert/reorder and land on a different item).
export type PatchPathSegment = string | { label: unknown; nth: number };

// One conditional set: lands only when the value at `path` currently equals
// `expect`, i.e. the store still holds what the view rendered before the operation.
export type PatchSetEntry = {
  path: PatchPathSegment[];
  expect: unknown;
  value: unknown;
};

/**
 * Write a node-scoped conditional edit back into the store (view writeback).
 * Returns false on any refusal — a gone snapshot (404), a node id no longer in the
 * latest tree, a target the label correspondence can't identify, or a value that
 * moved since the view rendered it (409), or a schema-breaking set (422) — so the
 * caller can revert its optimistic display. The server pushes a change
 * notification on success; the open view picks up the stored state through the
 * following refetch.
 */
export async function patchSnapshot(
  snapshotId: string,
  nodeId: string,
  set: PatchSetEntry[],
): Promise<boolean> {
  try {
    const res = await fetch(`/api/snapshots/${encodeURIComponent(snapshotId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nodeId, set }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
