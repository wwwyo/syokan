import type { CSSProperties } from "react";
import { type Font, useFont } from "@/lib/font";
import { cn } from "@/lib/utils";

// ラベルを各フォントで描画してプレビューにする。styles.css の正確なスタックとは別物の
// 簡易プレビューで良いので主要 family だけ指定する。
const OPTIONS: ReadonlyArray<{ value: Font; label: string; preview: string }> = [
  { value: "geist", label: "Geist", preview: '"Geist", sans-serif' },
  {
    value: "current",
    label: "Moralerspace",
    preview: '"Moralerspace Argon", monospace',
  },
  { value: "system", label: "システム", preview: "ui-sans-serif, system-ui, sans-serif" },
];

/**
 * 表示フォント (current/geist/system) を切り替える segmented control。
 * ThemeSelect と同じ形。各ラベルはそのフォントで描画して見た目を確認できる。
 */
export function FontSelect() {
  const { font, setFont } = useFont();
  return (
    <div
      role="group"
      aria-label="フォント"
      data-slot="font-select"
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1"
    >
      {OPTIONS.map(({ value, label, preview }) => {
        const active = font === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => setFont(value)}
            style={{ fontFamily: preview } as CSSProperties}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
