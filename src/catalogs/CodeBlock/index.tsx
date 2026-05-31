import { useEffect, useState } from "react";
import { highlightToHtml } from "@/lib/shiki";

export type CodeBlockProps = {
  code: string;
  lang?: string;
  filename?: string;
};

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
      className="my-4 overflow-hidden rounded-lg border border-border bg-muted"
    >
      {filename ? (
        <div
          data-slot="codeblock-filename"
          className="border-b border-border px-4 py-2 font-mono text-xs text-muted-foreground"
        >
          {filename}
        </div>
      ) : null}
      {inner}
    </div>
  );
}
