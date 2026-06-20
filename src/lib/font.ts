import { useCallback, useEffect, useState } from "react";

export type Font = "current" | "geist" | "system";

// index.html の inline script (FOUC 防止) と同じ key。両者は同じ規則で動く必要がある。
export const FONT_STORAGE_KEY = "syokan:font";

const FONTS: readonly Font[] = ["current", "geist", "system"];

export function isFont(value: unknown): value is Font {
  return typeof value === "string" && (FONTS as readonly string[]).includes(value);
}

export function getStoredFont(): Font {
  if (typeof window === "undefined") return "current";
  try {
    const stored = window.localStorage.getItem(FONT_STORAGE_KEY);
    return isFont(stored) ? stored : "current";
  } catch {
    return "current";
  }
}

function persistFont(font: Font): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FONT_STORAGE_KEY, font);
  } catch {
    // storage 不可環境では永続化を諦める (フォント自体は当 session で効く)
  }
}

/** <html data-font> を設定する。実フォントは styles.css の --app-font-* が解決する。 */
export function applyFont(font: Font): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.font = font;
}

/** フォント選択 (current/geist/system) を localStorage に永続化し <html data-font> に反映する。 */
export function useFont(): { font: Font; setFont: (font: Font) => void } {
  const [font, setFontState] = useState<Font>(getStoredFont);

  useEffect(() => {
    applyFont(font);
  }, [font]);

  const setFont = useCallback((next: Font) => {
    persistFont(next);
    setFontState(next);
  }, []);

  return { font, setFont };
}
