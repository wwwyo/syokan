import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { deleteSnapshot, nextSnapshotId } from "@/lib/snapshots";
import { useSnapshotList } from "./snapshotList";

export type DeleteOptions = {
  // 削除対象が表示中の snapshot か。true なら削除後に隣 (次→前) or home へ遷移する。
  isCurrent: boolean;
};

/**
 * snapshot 削除の単一フロー。ViewHeader (表示中) と sidebar (任意行) の両方から使う。
 * 削除→一覧 refresh→(表示中なら) 遷移、までを一貫して扱う。
 */
export function useDeleteSnapshot() {
  const router = useRouter();
  const { state, refresh } = useSnapshotList();

  return useCallback(
    async (id: string, { isCurrent }: DeleteOptions) => {
      if (
        typeof window !== "undefined" &&
        !window.confirm("この snapshot を削除しますか？")
      ) {
        return;
      }
      // 遷移先は削除前の並びから決める (削除後は隣接位置が失われるため)。
      const before = state.status === "ready" ? state.items : [];
      const next = nextSnapshotId(before, id);
      if (!(await deleteSnapshot(id))) {
        if (typeof window !== "undefined") window.alert("削除に失敗しました");
        return;
      }
      const after = await refresh();
      if (!isCurrent) return;
      // 算出した遷移先が削除後の一覧にまだ在るときだけ開く。無ければ home へ。
      const target = next && after.some((i) => i.id === next) ? next : null;
      if (target) {
        await router.navigate({ to: "/views/$id", params: { id: target } });
      } else {
        await router.navigate({ to: "/" });
      }
    },
    [router, state, refresh],
  );
}
