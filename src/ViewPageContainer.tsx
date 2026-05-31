import { useCallback, useEffect, useState } from "react";
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
    const res = await fetch(`/api/views/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok || res.status === 404) {
      // 同じ URL を再度開くと 404 になる状態に揃える
      setState({ kind: "not-found", id });
    } else {
      setState({ kind: "error", message: `Delete failed (${res.status})` });
    }
  }, [id]);

  return <ViewPage state={state} onDelete={handleDelete} />;
}
