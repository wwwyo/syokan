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
      setState({ status: "error" });
      return [];
    }
  }, []);

  useEffect(() => {
    void refresh();
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
