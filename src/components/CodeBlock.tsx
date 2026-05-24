import { useEffect, useState } from "react";
import { highlightToHtml } from "@/lib/shiki";

export type CodeBlockProps = {
  code: string;
  lang?: string;
};

export function CodeBlock({ code, lang }: CodeBlockProps) {
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

  if (html) {
    return (
      <div
        data-slot="codeblock"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki が生成した信頼済み HTML
        dangerouslySetInnerHTML={{ __html: html }}
        className="my-4 overflow-x-auto rounded-lg text-sm leading-6 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:p-4"
      />
    );
  }

  return (
    <pre
      data-slot="codeblock"
      className="my-4 overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm leading-6"
    >
      <code>{code}</code>
    </pre>
  );
}
