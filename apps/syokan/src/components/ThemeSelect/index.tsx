import { Monitor, Moon, Sun } from "lucide-react";
import type { ComponentType } from "react";
import { t } from "@/lib/i18n";
import { type Theme, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: ReadonlyArray<{
  value: Theme;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}> = [
  { value: "system", label: t.themeSelect.system, Icon: Monitor },
  { value: "light", label: t.themeSelect.light, Icon: Sun },
  { value: "dark", label: t.themeSelect.dark, Icon: Moon },
];

/**
 * テーマ (system/light/dark) を切り替える segmented control。
 * 3 択は現在値が一目で分かる方が良いので dropdown ではなく横並びにする。
 */
export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="group"
      aria-label={t.themeSelect.label}
      data-slot="theme-select"
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => setTheme(value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
