import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type CodeSnippetProps = {
  code: string;
  className?: string;
  /** Override the copy button labels. Defaults to app i18n (locale auto-switch); pass this where locale-independence is wanted. */
  labels?: { copy: string; copied: string };
};

/**
 * A lightweight block that shows short static code fragments in monospace.
 * The catalog's Code (pierre File) assumes virtualization and depends on initial measurement,
 * so it collapses inside tabs/folds; for highlight-free doc use, a bare <pre> is used instead.
 */
export function CodeSnippet({ code, className, labels }: CodeSnippetProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Where clipboard is unavailable (e.g. non-secure context), give up on copying
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
        aria-label={copied ? (labels?.copied ?? t.common.copied) : (labels?.copy ?? t.common.copy)}
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
