import { Check, Search } from "lucide-react";
import { type CSSProperties, useMemo, useState } from "react";
import { useFont } from "@/lib/font";
import { FONT_PRESETS } from "@/lib/fonts";
import { cn } from "@/lib/utils";

/**
 * 表示フォントをプリセット表 (src/lib/fonts.ts) から検索して選ぶ。各候補はその
 * フォントスタックで描画してプレビューにする (未読込の Google フォントは選択時に
 * 動的読込されるまでフォールバック表示)。
 */
export function FontSelect() {
  const { font, setFont } = useFont();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FONT_PRESETS;
    return FONT_PRESETS.filter(
      (p) => p.label.toLowerCase().includes(q) || p.value.includes(q),
    );
  }, [query]);

  return (
    <div data-slot="font-select" className="w-full max-w-xs">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="フォントを検索"
          aria-label="フォントを検索"
          className="w-full rounded-lg border border-border bg-card py-2 pr-3 pl-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <ul
        aria-label="フォント"
        className="mt-2 max-h-64 overflow-auto rounded-lg border border-border bg-card p-1"
      >
        {filtered.map((p) => {
          const active = font === p.value;
          return (
            <li key={p.value}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => setFont(p.value)}
                style={{ fontFamily: p.sans } as CSSProperties}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                <span className="truncate">{p.label}</span>
                {active ? <Check className="size-4 shrink-0" /> : null}
              </button>
            </li>
          );
        })}
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-sm text-muted-foreground">該当なし</li>
        ) : null}
      </ul>
    </div>
  );
}
