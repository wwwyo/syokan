import { useCallback, useEffect, useState } from "react";

export type Theme = "system" | "light" | "dark";

// index.html の inline script (FOUC 防止) と同じ key。両者は同じ規則で動く必要がある。
export const THEME_STORAGE_KEY = "syokan:theme";

const THEMES: readonly Theme[] = ["system", "light", "dark"];

export function isTheme(value: unknown): value is Theme {
  return (
    typeof value === "string" && (THEMES as readonly string[]).includes(value)
  );
}

/** stored theme を実際の表示色に解決する。system は OS preference に従う。純関数。 */
export function resolveScheme(
  theme: Theme,
  systemPrefersDark: boolean,
): "light" | "dark" {
  if (theme === "system") return systemPrefersDark ? "dark" : "light";
  return theme;
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function persistTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // storage 不可環境では永続化を諦める (テーマ自体は当 session で効く)
  }
}

/** <html> の .dark を解決済み scheme に合わせる。inline script と同じ規則。 */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const dark = resolveScheme(theme, systemPrefersDark()) === "dark";
  document.documentElement.classList.toggle("dark", dark);
}

/**
 * テーマ選択 (system/light/dark) を localStorage に永続化し <html>.dark に反映する。
 * system のときだけ OS preference の変化を購読して追従する。
 */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system" || typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    persistTheme(next);
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
