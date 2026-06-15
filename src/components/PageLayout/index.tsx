import { type ReactNode, useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { cn } from "@/lib/utils";
import { SidebarProvider } from "./sidebarContext";

export type PageLayoutProps = {
  /** ページ見出し (envelope.title)。未指定なら見出し帯を出さない */
  title?: string;
  /**
   * 本文の外側に置く viewer chrome (例: ViewHeader)。
   * schema-driven の render tree には含めず、viewer 側から差し込む。
   */
  header?: ReactNode;
  /**
   * 幅制約 (max-w-2xl) を外し viewport いっぱいに広げる。
   * root が resizable Stack のように画面全体を使うレイアウトのとき viewer 側から true にする。
   */
  fullBleed?: boolean;
  children?: ReactNode;
};

// snapshot をまたいで開閉状態を保つ (リンク遷移は full reload のため state が消える)。
const SIDEBAR_STORAGE_KEY = "syokan:sidebar-open";

// storage が無効な環境 (sandboxed iframe / storage 制限) では throw しうる。
// UI 設定の保存失敗で snapshot 閲覧まで壊さないよう握りつぶす。
function readPersistedOpen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * snapshot の root に常に適用される共通レイアウト。
 * 背景・最大幅・余白・ページ見出しといった「ページの器」を 1 箇所に集約し、
 * catalog component (LLM が JSON で投げる type) からは器の責務を排除する。
 * fullBleed のときは flex chain で main に残り高さを渡し、中身を画面いっぱいに伸ばす。
 *
 * 左の AppSidebar は非モーダルの flex 兄弟なので、開いても main は操作可能なまま
 * 幅だけ reflow する。
 */
export function PageLayout({
  title,
  header,
  fullBleed = false,
  children,
}: PageLayoutProps) {
  const [open, setOpen] = useState(readPersistedOpen);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, open ? "1" : "0");
    } catch {
      // storage 不可環境では永続化を諦める (機能本体には影響しない)
    }
  }, [open]);

  const sidebar = useMemo(
    () => ({ open, toggle: () => setOpen((v) => !v) }),
    [open],
  );

  return (
    <SidebarProvider value={sidebar}>
      <div
        data-slot="page-shell"
        className="flex min-h-svh w-full bg-background text-foreground"
      >
        <AppSidebar />
        <div
          data-slot="page-layout"
          className="flex min-w-0 flex-1 flex-col"
        >
          {header}
          <main
            className={cn(
              fullBleed
                ? "flex w-full flex-1 flex-col px-4 py-4"
                : "mx-auto w-full max-w-2xl px-6 py-12",
            )}
          >
            {title ? (
              <h1 className="mb-6 text-3xl font-semibold tracking-tight">
                {title}
              </h1>
            ) : null}
            {fullBleed ? (
              <div className="min-h-0 flex-1">{children}</div>
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
