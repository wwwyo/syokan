import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type CopyButtonProps = {
  code: string;
  className?: string;
};

/**
 * modern clipboard API でコピーし、拒否された場合は legacy execCommand に fallback する。
 * storybook の nested iframe (permissions policy / フォーカス) や非 HTTPS など、
 * clipboard API が reject する文脈でもコピーを成立させ、true を返す。
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // modern API が使えない/拒否された → legacy にフォールバック
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

// 生の code をコピーし、成功したら 1.5s だけチェックマークに切り替える。
// 出現 (hover/focus) と配置 (absolute / flex 行内) は呼び出し側が className で決める。
// Code 専用の内部サブパーツ。
export function CopyButton({ code, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const onCopy = () => {
    void copyText(code).then((ok) => {
      if (ok) setCopied(true);
    });
  };

  return (
    <button
      type="button"
      data-slot="code-copy"
      onClick={onCopy}
      aria-label={copied ? t.common.copied : t.common.copyCode}
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-border bg-background/80 p-1 text-muted-foreground backdrop-blur hover:text-foreground",
        className,
      )}
    >
      {copied ? (
        <Check className="size-4" aria-hidden />
      ) : (
        <Copy className="size-4" aria-hidden />
      )}
    </button>
  );
}
