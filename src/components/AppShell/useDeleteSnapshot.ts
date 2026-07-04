import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { deleteSnapshot, nextSnapshotId } from "@/lib/snapshots";
import type { SnapshotSummary } from "@/schema";
import { shellRouteApi } from "./shellRouteApi";

export type DeleteOptions = {
  // 削除対象が表示中の snapshot か。true なら削除後に隣 (次→前) or home へ遷移する。
  isCurrent: boolean;
};

// invalidate 後の最新一覧を imperative に読む (useLoaderData は hook で callback から呼べない)。
// _shell は全 route の祖先なので常に matches に居る。
function shellItems(router: ReturnType<typeof useRouter>): SnapshotSummary[] {
  const match = router.state.matches.find((m) => m.routeId === "/_shell");
  return (match?.loaderData ?? []) as SnapshotSummary[];
}

/**
 * snapshot 削除の単一フロー。ViewHeader (表示中) と sidebar (任意行) の両方から使う。
 * 削除→shell loader を invalidate (sidebar 最新化)→(表示中なら) 遷移、までを一貫して扱う。
 */
export function useDeleteSnapshot() {
  const router = useRouter();
  const before = shellRouteApi.useLoaderData();

  return useCallback(
    async (id: string, { isCurrent }: DeleteOptions) => {
      // 遷移先は削除前の並びから決める (削除後は隣接位置が失われるため)。
      const next = nextSnapshotId(before, id);
      if (!(await deleteSnapshot(id))) {
        if (typeof window !== "undefined") window.alert("削除に失敗しました");
        return;
      }
      // shell loader だけ再実行して sidebar を最新化する。表示中の envelope は再取得しない
      // (削除対象を見ている場合に not-found へ一瞬落ちるのを避ける)。消えた snapshot への
      // リンクは一覧から消え、戻る操作は staleTime=0 で loader を再実行し 404 を出す。
      await router.invalidate({ filter: (m) => m.routeId === "/_shell" });
      if (isCurrent) {
        // 算出した遷移先が削除後の一覧にまだ在るときだけ開く。無ければ home へ。
        const after = shellItems(router);
        const target = next && after.some((i) => i.id === next) ? next : null;
        await router.navigate(
          target ? { to: "/snapshots/$id", params: { id: target } } : { to: "/" },
        );
      }
    },
    [router, before],
  );
}
