import { useEffect, useState } from "react";
import { useSidebar } from "@/components/PageLayout/sidebarContext";
import { matchViewId } from "@/lib/route";
import { cn } from "@/lib/utils";
import { type ViewSummary, ViewList } from "./ViewList";

type ListState =
  | { kind: "loading" }
  | { kind: "ready"; items: ViewSummary[] }
  | { kind: "error" };

function currentViewId(): string | null {
  if (typeof window === "undefined") return null;
  return matchViewId(window.location.pathname);
}

/**
 * 非モーダルの push 型 sidebar。開くと flex の兄弟として幅を持ち main を押し出す
 * ので、開いたまま main を操作できる。閉じているときは幅 0 + inert にして
 * tab フォーカスが内部リンクに入らないようにする。
 * 一覧は開いたタイミングで取得し、開くたびに最新化する。
 */
export function AppSidebar() {
  const sidebar = useSidebar();
  const open = sidebar?.open ?? false;
  const [state, setState] = useState<ListState>({ kind: "loading" });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ kind: "loading" });
    fetch("/api/views")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "error" });
          return;
        }
        const data = (await res.json()) as { items: ViewSummary[] };
        setState({ kind: "ready", items: data.items });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <aside
      data-slot="app-sidebar"
      aria-label="ページ一覧"
      inert={!open}
      className={cn(
        "shrink-0 overflow-hidden border-border transition-[width] duration-200 ease-in-out",
        open ? "w-64 border-r" : "w-0",
      )}
    >
      <div className="sticky top-0 flex h-svh w-64 flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <a
            href="/"
            className="text-sm font-semibold tracking-tight text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            syokan
          </a>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {state.kind === "loading" ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">読み込み中…</p>
          ) : state.kind === "error" ? (
            <p className="px-3 py-2 text-sm text-destructive">
              一覧の取得に失敗しました
            </p>
          ) : (
            <ViewList items={state.items} currentId={currentViewId()} />
          )}
        </nav>
      </div>
    </aside>
  );
}
