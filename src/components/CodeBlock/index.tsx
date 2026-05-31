import { useEffect, useState } from "react";
import { highlightToHtml } from "@/lib/shiki";
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

export function CodeBlock({ code, lang, filename }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // code/lang が変わったら一旦 plain fallback に戻す。
    // リセットしないと前の code のハイライト HTML が残って表示される。
    setHtml(null);
    highlightToHtml(code, lang)
      .then((result) => {
        if (!cancelled) setHtml(result);
      })
      .catch(() => {
        // highlight 失敗時は plain fallback のまま
      });
    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  const inner = html ? (
    <div
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki が生成した信頼済み HTML
      dangerouslySetInnerHTML={{ __html: html }}
      className="text-sm leading-6 [&_pre]:overflow-x-auto [&_pre]:bg-transparent [&_pre]:p-4"
    />
  ) : (
    <pre className="overflow-x-auto p-4 font-mono text-sm leading-6">
      <code>{code}</code>
    </pre>
  );

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
      {inner}
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
