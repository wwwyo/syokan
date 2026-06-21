import { File } from "@pierre/diffs/react";
import type { CSSProperties } from "react";
import { z } from "zod";
import { toCodeLang } from "@/lib/code";
import { useColorScheme } from "@/lib/useColorScheme";
import { cn } from "@/lib/utils";
import { CopyButton } from "./CopyButton";

export const codePropsSchema = z
  .object({
    code: z.string(),
    lang: z.string().optional(),
    filename: z.string().optional(),
  })
  .strict();

export type CodeProps = z.infer<typeof codePropsSchema>;

const COPY_REVEAL =
  "opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100";

// pierre File の host (diffs-container) はテーマ背景 (github の編集面) を自分で持つ。
// host に直接 padding / 行間を渡すことで、別サーフェスを重ねず単一面に余白付きで描画する。
// (旧実装は bg-muted の枠に白いコード面が重なり濁っていた)
const FILE_STYLE = {
  display: "block",
  padding: "0.875rem 1rem",
  "--diffs-font-size": "13px",
  "--diffs-line-height": "1.65",
} as CSSProperties;

const FILE_OPTIONS = {
  // app 全体のコード表示で揃える github テーマ。dark/light は themeType で切替
  theme: { dark: "github-dark", light: "github-light" },
  disableFileHeader: true,
  disableLineNumbers: true,
  overflow: "scroll",
} as const;

/**
 * コード断片を等幅 + シンタックスハイライトで表示する catalog component。
 * ハイライトは @pierre/diffs の File に委譲し Diff と同じ Shiki スタックに統一する。
 * コード面は File 自身のテーマ背景を唯一のサーフェスとし、filename / CopyButton は
 * その上に重ねる chrome として持つ。lang 未指定/未知は "text" として素のテキストで見せる。
 *
 * 既知の制約 (dev のみ): grammar が cold の初回描画では File が空プレースホルダ (高さ0) を
 * 出し、非同期ハイライト完了時の再描画 callback で本文に差し替える。React StrictMode は
 * mount→unmount→remount するため、その callback が unmount で cleanUp 済み (enabled=false) の
 * 旧インスタンスに届き no-op になり、高さ0 のまま潰れる (tab 内は決定的、ViewPage は時々)。
 * warm (grammar キャッシュ済) や本番 (StrictMode 無効) では同期描画され問題ない。
 */
export function Code({ code, lang, filename }: CodeProps) {
  const themeType = useColorScheme();
  return (
    <div
      data-slot="code"
      className="group relative my-4 overflow-hidden rounded-xl border border-border bg-card shadow-sm"
    >
      {filename ? (
        <div
          data-slot="code-filename"
          className="flex items-center justify-between gap-2 border-b border-border px-4 py-2"
        >
          <span className="truncate font-mono text-xs font-medium text-muted-foreground">
            {filename}
          </span>
          <CopyButton code={code} className={COPY_REVEAL} />
        </div>
      ) : null}
      <File
        file={{ name: filename ?? "code", contents: code, lang: toCodeLang(lang) }}
        style={FILE_STYLE}
        options={{ ...FILE_OPTIONS, themeType }}
      />
      {filename ? null : (
        <CopyButton
          code={code}
          className={cn("absolute right-2 top-2 z-10", COPY_REVEAL)}
        />
      )}
    </div>
  );
}
