import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type CopyButtonProps = {
  code: string;
  className?: string;
};

// 生の code をクリップボードへ書き込み、成功したら 3s だけチェックマークに
// 切り替える。出現 (hover/focus) と配置 (absolute / flex 行内) は呼び出し側が
// className で決める。Code 専用の内部サブパーツ。
export function CopyButton({ code, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 3000);
    return () => clearTimeout(timer);
  }, [copied]);

  const onCopy = () => {
    // clipboard 非対応 (非 HTTPS / 古い環境) は `?.` で no-op にする
    navigator.clipboard?.writeText(code)?.then(
      () => setCopied(true),
      () => {
        // 書き込み失敗時は何もしない
      },
    );
  };

  return (
    <button
      type="button"
      data-slot="code-copy"
      onClick={onCopy}
      aria-label={copied ? "Copied" : "Copy code"}
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
