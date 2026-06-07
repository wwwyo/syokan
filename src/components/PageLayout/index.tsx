import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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

/**
 * snapshot の root に常に適用される共通レイアウト。
 * 背景・最大幅・余白・ページ見出しといった「ページの器」を 1 箇所に集約し、
 * catalog component (LLM が JSON で投げる type) からは器の責務を排除する。
 * fullBleed のときは flex chain で main に残り高さを渡し、中身を画面いっぱいに伸ばす。
 */
export function PageLayout({
  title,
  header,
  fullBleed = false,
  children,
}: PageLayoutProps) {
  return (
    <div
      data-slot="page-layout"
      className="flex min-h-screen flex-col bg-background text-foreground"
    >
      {header}
      <main
        className={cn(
          fullBleed
            ? "flex w-full flex-1 flex-col px-4 py-4"
            : "mx-auto max-w-2xl px-6 py-12",
        )}
      >
        {title ? (
          <h1 className="mb-6 text-3xl font-semibold tracking-tight">{title}</h1>
        ) : null}
        {fullBleed ? <div className="min-h-0 flex-1">{children}</div> : children}
      </main>
    </div>
  );
}
