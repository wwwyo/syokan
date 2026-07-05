import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "../../../lib/i18n";
import { cn } from "../../../lib/utils";

export type CopyButtonProps = {
  code: string;
  className?: string;
};

/**
 * Copy via the modern clipboard API, falling back to the legacy execCommand if rejected.
 * Even in contexts where the clipboard API rejects — Storybook's nested iframe (permissions
 * policy / focus), non-HTTPS, etc. — this still gets the copy done and returns true.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // modern API unavailable/rejected → fall back to legacy
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

// Copies the raw code and, on success, switches to a checkmark for just 1.5s.
// Reveal (hover/focus) and placement (absolute / inside a flex row) are decided by the caller via className.
// An internal subpart specific to Code.
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
