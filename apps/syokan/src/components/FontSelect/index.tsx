import { Check, ChevronsUpDown, Search } from "lucide-react";
import { type CSSProperties, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { useFont } from "../../lib/font";
import { FONT_PRESETS, getFontPreset } from "../../lib/fonts";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";

/**
 * Search the preset table (src/lib/fonts.ts) to pick the display font. Each candidate is
 * rendered in its own font stack as a preview (an unloaded Google font shows a fallback until
 * it is dynamically loaded on selection).
 */
export function FontSelect() {
  const { font, setFont } = useFont();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FONT_PRESETS;
    return FONT_PRESETS.filter(
      (p) => p.label.toLowerCase().includes(q) || p.value.includes(q),
    );
  }, [query]);

  const current = getFontPreset(font);

  return (
    <div data-slot="font-select">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger
          data-slot="font-select-trigger"
          className="flex w-56 items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className="truncate"
            style={{ fontFamily: current.sans } as CSSProperties}
          >
            {current.label}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.fontSelect.search}
              aria-label={t.fontSelect.search}
              autoFocus
              className="w-full rounded-lg border border-border bg-background py-2 pr-3 pl-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <ul
            aria-label={t.fontSelect.listLabel}
            className="mt-2 max-h-64 overflow-auto rounded-lg"
          >
            {filtered.map((p) => {
              const active = font === p.value;
              return (
                <li key={p.value}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setFont(p.value);
                      setOpen(false);
                    }}
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
              <li className="px-3 py-2 text-sm text-muted-foreground">
                {t.fontSelect.noMatches}
              </li>
            ) : null}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
