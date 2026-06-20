import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  SIDEBAR_ID,
  useSidebar,
} from "@/components/PageLayout/sidebarContext";
import { matchViewId } from "@/lib/route";
import { useScrollRestore } from "@/lib/useScrollRestore";
import { cn } from "@/lib/utils";
import { deleteView, nextViewId } from "@/lib/views";
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
  // 一覧は full-reload 遷移をまたいでも見ていた位置を保つ (sidebar 共通なので固定 key)。
  const navRef = useRef<HTMLElement>(null);
  useScrollRestore(navRef, "syokan:scroll:sidebar");

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
        // json 解析中に閉じ→再 open すると別 fetch が走るので、古い結果で
        // 新しい結果を上書きしないよう解析後にも中断を確認する。
        if (cancelled) return;
        setState({ kind: "ready", items: data.items });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // 表示中を消したら隣 (次→前) へ遷移し、それ以外は一覧から除くだけ。
  // 遷移先は削除前の並びから決める必要があるので削除より先に算出する。
  async function handleDelete(id: string) {
    if (typeof window !== "undefined") {
      if (!window.confirm("この snapshot を削除しますか？")) return;
    }
    const items = state.kind === "ready" ? state.items : [];
    const next = nextViewId(items, id);
    if (!(await deleteView(id))) return;
    if (id === currentViewId()) {
      window.location.href = next ? `/views/${encodeURIComponent(next)}` : "/";
      return;
    }
    setState((s) =>
      s.kind === "ready"
        ? { kind: "ready", items: s.items.filter((i) => i.id !== id) }
        : s,
    );
  }

  return (
    <aside
      id={SIDEBAR_ID}
      data-slot="app-sidebar"
      aria-label="ページ一覧"
      inert={!open}
      className={cn(
        "shrink-0 overflow-hidden border-border transition-[width] duration-200 ease-in-out motion-reduce:transition-none",
        open ? "w-64 border-r" : "w-0",
      )}
    >
      <div className="flex h-full w-64 flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <a
            href="/"
            className="text-sm font-semibold tracking-tight text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            syokan
          </a>
          {/* ViewHeader が無い状態 (404 / loading / error) でも閉じられるよう sidebar 内にも閉じる操作を置く */}
          {sidebar ? (
            <button
              type="button"
              aria-label="閉じる"
              onClick={sidebar.toggle}
              className="-mr-1 flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        <nav ref={navRef} className="flex-1 overflow-y-auto p-2">
          {state.kind === "loading" ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">読み込み中…</p>
          ) : state.kind === "error" ? (
            <p className="px-3 py-2 text-sm text-destructive">
              一覧の取得に失敗しました
            </p>
          ) : (
            <ViewList
              items={state.items}
              currentId={currentViewId()}
              onDelete={handleDelete}
            />
          )}
        </nav>
      </div>
    </aside>
  );
}
