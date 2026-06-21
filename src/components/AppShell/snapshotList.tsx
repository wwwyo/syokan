import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { fetchSnapshotList } from "@/lib/snapshots";
import type { SnapshotSummary } from "@/schema";

export type SnapshotListState =
  | { status: "loading" }
  | { status: "ready"; items: SnapshotSummary[] }
  | { status: "error" };

export type SnapshotListContextValue = {
  state: SnapshotListState;
  // 取り直して最新の items を返す。返り値は delete 後の遷移先判定に使う。
  refresh: () => Promise<SnapshotSummary[]>;
};

const SnapshotListContext = createContext<SnapshotListContextValue | null>(null);

/**
 * snapshot 一覧を常駐 shell に持たせる provider。mount 時に 1 度取得し、client 遷移では
 * 再取得しない (遷移ごとの loading を出さないため)。作成は外 (CLI/LLM) で起きるので
 * その後の `syokan open` は full reload となり一覧は作り直される。削除は in-app なので
 * refresh() で明示的に最新化する。
 */
export function SnapshotListProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SnapshotListState>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      const items = await fetchSnapshotList();
      setState({ status: "ready", items });
      return items;
    } catch {
      // 既に一覧を持っているなら、focus 時の transient な失敗で消さない (初回だけ error)。
      setState((prev) => (prev.status === "ready" ? prev : { status: "error" }));
      return [];
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 作成は外 (CLI/LLM) で起きるため in-app の契機が無い。tab に戻った / 可視化した
  // タイミングで取り直し、開いたままのアプリにも新しい snapshot を反映する。
  // refresh は loading に落とさないので一覧のちらつきは出ない。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onActive = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    window.addEventListener("focus", onActive);
    document.addEventListener("visibilitychange", onActive);
    return () => {
      window.removeEventListener("focus", onActive);
      document.removeEventListener("visibilitychange", onActive);
    };
  }, [refresh]);

  return (
    <SnapshotListContext.Provider value={{ state, refresh }}>
      {children}
    </SnapshotListContext.Provider>
  );
}

export function useSnapshotList(): SnapshotListContextValue {
  const ctx = useContext(SnapshotListContext);
  if (!ctx) {
    throw new Error(
      "useSnapshotList must be used within a SnapshotListProvider",
    );
  }
  return ctx;
}
