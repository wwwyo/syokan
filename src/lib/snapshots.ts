import type { SnapshotEnvelope, SnapshotSummary } from "@/schema";

/**
 * 削除した snapshot の「次に開くべき」id を一覧 (newest first) から決める。
 * 削除位置の直後 → 無ければ直前 → どちらも無ければ null (= home に戻す)。
 */
export function nextSnapshotId(
  items: readonly { id: string }[],
  deletedId: string,
): string | null {
  const i = items.findIndex((v) => v.id === deletedId);
  if (i === -1) return null;
  return items[i + 1]?.id ?? items[i - 1]?.id ?? null;
}

/** 1 snapshot を取得する。404 は null、その他の失敗は throw (route loader が error 表示へ回す)。 */
export async function fetchSnapshotEnvelope(
  id: string,
): Promise<SnapshotEnvelope | null> {
  const res = await fetch(`/api/snapshots/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as SnapshotEnvelope;
}

/** snapshot 一覧を取得する。失敗は throw する (呼び出し側で握って error 状態にする)。 */
export async function fetchSnapshotList(): Promise<SnapshotSummary[]> {
  const res = await fetch("/api/snapshots");
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const data = (await res.json()) as { items: SnapshotSummary[] };
  return data.items;
}

/** snapshot を削除する。既に無い (404) も成功扱い (冪等)。network 断は false を返す。 */
export async function deleteSnapshot(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/snapshots/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return res.ok || res.status === 404;
  } catch {
    // fetch reject (オフライン等) を握って false にし、呼び出し側の floating promise を
    // unhandled rejection にしない (UI は「失敗」として扱える)。
    return false;
  }
}
