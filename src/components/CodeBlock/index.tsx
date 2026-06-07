import { File } from "@pierre/diffs/react";
import { toCodeLang } from "@/lib/code";
import { useColorScheme } from "@/lib/useColorScheme";
import { cn } from "@/lib/utils";
import { CopyButton } from "./CopyButton";

export type CodeBlockProps = {
  code: string;
  lang?: string;
  filename?: string;
};

// hover / focus 時だけ現れる遷移。filename 行内・absolute 配置の両方で共有する。
const COPY_REVEAL =
  "opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100";

/**
 * コードを等幅 + シンタックスハイライトで表示する共有内部部品 (MarkdownDoc / PlainText が利用)。
 * ハイライトは @pierre/diffs の File に委譲し、diff と同じ Shiki スタックに統一する。
 * filename ヘッダと CopyButton は light DOM 側の chrome として持ち、コード本体のみ File へ渡す
 * (pierre 既定のヘッダ/行番号は無効化)。lang 未指定は "text" として素のテキストで見せる。
 */
export function CodeBlock({ code, lang, filename }: CodeBlockProps) {
  const themeType = useColorScheme();
  return (
    <div
      data-slot="codeblock"
      className="group relative my-4 overflow-hidden rounded-lg border border-border bg-muted"
    >
      {filename ? (
        // filename がある時はヘッダ行に filename と copy を同じ row で並べる
        <div
          data-slot="codeblock-filename"
          className="flex items-center justify-between gap-2 border-b border-border px-4 py-1.5"
        >
          <span className="truncate font-mono text-xs text-muted-foreground">
            {filename}
          </span>
          <CopyButton code={code} className={COPY_REVEAL} />
        </div>
      ) : null}
      {/* File は自前テーマ背景で edge-to-edge に描画するため、内側に余白を持たせて
          コードブロックらしい見た目にする (旧 <pre> の p-4 相当) */}
      <div className="px-4 py-3 text-sm">
        <File
          file={{
            name: filename ?? "code",
            contents: code,
            lang: toCodeLang(lang),
          }}
          options={{
            // app の他コード表示と揃える github テーマ。dark/light は themeType で切替
            theme: { dark: "github-dark", light: "github-light" },
            themeType,
            disableFileHeader: true,
            disableLineNumbers: true,
            overflow: "scroll",
          }}
        />
      </div>
      {filename ? null : (
        // filename が無い時はコード右上に浮かせる
        <CopyButton
          code={code}
          className={cn("absolute right-1.5 top-1.5", COPY_REVEAL)}
        />
      )}
    </div>
  );
}
