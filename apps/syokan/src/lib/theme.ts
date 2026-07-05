import { useCallback, useEffect, useState } from "react";
import { type Setting, THEME_VALUES } from "@/schema";
import { fetchSetting, putSetting } from "./setting";

export type Theme = Setting["theme"];

// Same key as index.html's inline script (FOUC prevention). The two must follow the same rules.
export const THEME_STORAGE_KEY = "syokan:theme";

const THEMES: readonly Theme[] = THEME_VALUES;

export function isTheme(value: unknown): value is Theme {
  return (
    typeof value === "string" && (THEMES as readonly string[]).includes(value)
  );
}

/** Resolve the stored theme to the actual display color. system follows the OS preference. Pure function. */
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
    // where storage is unavailable, give up persisting (the theme still applies for this session)
  }
}

/** Match <html>'s .dark to the resolved scheme. Same rules as the inline script. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const dark = resolveScheme(theme, systemPrefersDark()) === "dark";
  document.documentElement.classList.toggle("dark", dark);
}

/**
 * Persist the theme selection (system/light/dark) to localStorage immediately while
 * also syncing it to the server (source of truth), and apply it to <html>.dark. It
 * re-fetches the server value on mount, so a change made in another browser is
 * reflected. Only when system, it subscribes to OS preference changes and follows them.
 */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    let alive = true;
    fetchSetting().then((s) => {
      if (!alive || !s || s.theme === getStoredTheme()) return;
      persistTheme(s.theme);
      setThemeState(s.theme);
    });
    return () => {
      alive = false;
    };
  }, []);

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
    void putSetting({ theme: next });
  }, []);

  return { theme, setTheme };
}
