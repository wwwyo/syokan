import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { useScrollRestore } from "@/lib/useScrollRestore";
import { SidebarProvider } from "./sidebarContext";

export type PageLayoutProps = {
  /**
   * 本文の外側に置く viewer chrome (例: ViewHeader)。
   * schema-driven の render tree には含めず、viewer 側から差し込む。
   */
  header?: ReactNode;
  /**
   * 幅制約 (max-w-4xl) を外し viewport いっぱいに広げる。
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
 * 背景・最大幅・余白といった「ページの器」を 1 箇所に集約し、
 * catalog component (LLM が JSON で投げる type) からは器の責務を排除する。
 * 見出しは器に持たせない。root の markdown 等が自前で見出しを持つため、
 * 器が title を h1 で出すと二重見出しになる。各ページが必要なら自分で出す。
 * fullBleed のときは flex chain で main に残り高さを渡し、中身を画面いっぱいに伸ばす。
 *
 * 左の AppSidebar は非モーダルの flex 兄弟なので、開いても main は操作可能なまま
 * 幅だけ reflow する。
 */
export function PageLayout({
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

  // 本文 scroll は pathname ごとに保存し、同じ snapshot に戻ったとき位置を復元する
  // (新しい snapshot は保存が無いので先頭から)。fullBleed は overflow-hidden なので対象外。
  const mainRef = useRef<HTMLElement>(null);
  const pathname =
    typeof window === "undefined" ? "/" : window.location.pathname;
  useScrollRestore(mainRef, `syokan:scroll:main:${pathname}`);

  return (
    <SidebarProvider value={sidebar}>
      {/* viewport 高に固定し document scroll を殺す。sidebar / header は固定のまま
          main だけが独立して縦スクロールする (各 region が自前の overflow を持つ)。 */}
      <div
        data-slot="page-shell"
        className="flex h-svh w-full overflow-hidden bg-background text-foreground"
      >
        <AppSidebar />
        <div
          data-slot="page-layout"
          className="flex min-w-0 flex-1 flex-col overflow-hidden"
        >
          {header}
          {fullBleed ? (
            <main
              data-slot="page-main"
              className="flex min-w-0 flex-1 flex-col overflow-hidden px-4 py-4"
            >
              <div className="min-h-0 flex-1">{children}</div>
            </main>
          ) : (
            <main
              ref={mainRef}
              data-slot="page-main"
              className="flex-1 overflow-y-auto"
            >
              <div className="mx-auto w-full max-w-4xl px-6 py-12">{children}</div>
            </main>
          )}
        </div>
      </div>
    </SidebarProvider>
  );
}
