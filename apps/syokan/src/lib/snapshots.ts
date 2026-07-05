import type { SnapshotEnvelope, SnapshotSummary } from "@/schema";

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
