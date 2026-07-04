import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type CodeSnippetProps = {
  code: string;
  className?: string;
};

/**
 * 静的な短いコード片を等幅で見せる軽量ブロック。
 * catalog の Code (pierre File) は仮想化前提で初回計測に依存し tab/折り畳みの中で
 * 崩れるため、ハイライト不要な doc 用途には素の <pre> を使う。
 */
export function CodeSnippet({ code, className }: CodeSnippetProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard 不可環境 (非 secure context 等) ではコピーを諦める
    }
  };

  return (
    <div
      data-slot="code-snippet"
      className={cn(
        "group relative my-4 overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        className,
      )}
    >
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? t.common.copied : t.common.copy}
        className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
      <pre className="overflow-x-auto px-4 py-3.5 text-[13px] leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
