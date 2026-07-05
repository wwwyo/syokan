import type { ReactNode } from "react";

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

/**
 * snapshot / home の本文を包む per-route レイアウト。常駐 shell (AppShell) の本文カラム内に
 * 描画され、header と本文 main を組む。背景・sidebar・開閉状態は shell 側の責務。
 * 見出しは器に持たせない (root の markdown 等が自前で見出しを持つため二重見出しを避ける)。
 *
 * 通常ページは document(window) スクロールに委ねる。header は sticky で上端へ貼り付け、
 * スクロール後も sidebar トグルへ届くようにする。
 * fullBleed (resizable Stack 等) は viewport 高に固定し、内側の panel に高さを渡して
 * document スクロールを殺す。
 */
export function PageLayout({
  header,
  fullBleed = false,
  children,
}: PageLayoutProps) {
  if (fullBleed) {
    return (
      <div data-slot="page-layout" className="flex h-svh flex-col">
        {header}
        <main
          data-slot="page-main"
          className="flex min-w-0 flex-1 flex-col overflow-hidden px-4 py-4"
        >
          <div className="min-h-0 flex-1">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div data-slot="page-layout" className="flex flex-1 flex-col">
      {header ? <div className="sticky top-0 z-20">{header}</div> : null}
      <main data-slot="page-main" className="flex-1">
        <div className="mx-auto w-full max-w-4xl px-6 py-12">{children}</div>
      </main>
    </div>
  );
}
