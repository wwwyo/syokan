import { useCallback, useEffect, useState } from "react";
import { deleteView, nextViewId } from "@/lib/views";
import type { SnapshotEnvelope } from "@/schema";
import { ViewPage, type ViewPageState } from "./ViewPage";

export type ViewPageContainerProps = {
  id: string;
};

export function ViewPageContainer({ id }: ViewPageContainerProps) {
  const [state, setState] = useState<ViewPageState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetch(`/api/views/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setState({ kind: "not-found", id });
          return;
        }
        if (!res.ok) {
          setState({ kind: "error", message: `Request failed (${res.status})` });
          return;
        }
        const envelope = (await res.json()) as SnapshotEnvelope;
        setState({ kind: "found", envelope });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ kind: "error", message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleDelete = useCallback(async () => {
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm("Delete this snapshot? This cannot be undone.");
    if (!confirmed) return;
    // 削除後に隣 (次→前) へ自動遷移する。位置を失わないよう削除前の並びから決める。
    let next: string | null = null;
    try {
      const res = await fetch("/api/views");
      if (res.ok) {
        const data = (await res.json()) as { items: { id: string }[] };
        next = nextViewId(data.items, id);
      }
    } catch {
      // 一覧が取れなければ home に戻す
    }
    if (!(await deleteView(id))) {
      setState({ kind: "error", message: "Delete failed" });
      return;
    }
    window.location.href = next ? `/views/${encodeURIComponent(next)}` : "/";
  }, [id]);

  return <ViewPage state={state} onDelete={handleDelete} />;
}
