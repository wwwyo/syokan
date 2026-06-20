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

/** snapshot を削除する。既に無い (404) 場合も成功扱いにする (冪等)。 */
export async function deleteView(id: string): Promise<boolean> {
  const res = await fetch(`/api/views/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return res.ok || res.status === 404;
}
