/**
 * 削除した snapshot の「次に開くべき」id を一覧 (newest first) から決める。
 * 削除位置の直後 → 無ければ直前 → どちらも無ければ null (= home に戻す)。
 */
export function nextViewId(
  items: readonly { id: string }[],
  deletedId: string,
): string | null {
  const i = items.findIndex((v) => v.id === deletedId);
  if (i === -1) return null;
  return items[i + 1]?.id ?? items[i - 1]?.id ?? null;
}

/** snapshot を削除する。既に無い (404) も成功扱い (冪等)。network 断は false を返す。 */
export async function deleteView(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/views/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return res.ok || res.status === 404;
  } catch {
    // fetch reject (オフライン等) を握って false にし、呼び出し側の floating promise を
    // unhandled rejection にしない (UI は「失敗」として扱える)。
    return false;
  }
}
