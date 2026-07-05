import { useCallback, useEffect, useState } from "react";
import { DEFAULT_FONT, getFontPreset, googleFontHref, isFontValue } from "./fonts";
import { fetchSetting, putSetting } from "./setting";

// What's stored is the preset's value (identifier). The actual font is resolved by the preset table in fonts.ts.
export type Font = string;

// Same key as index.html's inline script (FOUC prevention). The two must follow the same rules.
export const FONT_STORAGE_KEY = "syokan:font";
// Also store the resolved stack / href for FOUC purposes. The inline script cannot
// import the preset table (TS), so it reads this cache before render to set the CSS
// variables and inject the link.
const FONT_SANS_KEY = "syokan:font-sans";
const FONT_MONO_KEY = "syokan:font-mono";
const FONT_HREF_KEY = "syokan:font-href";

export function isFont(value: unknown): value is Font {
  return isFontValue(value);
}

export function getStoredFont(): Font {
  if (typeof window === "undefined") return DEFAULT_FONT;
  try {
    const stored = window.localStorage.getItem(FONT_STORAGE_KEY);
    return isFont(stored) ? stored : DEFAULT_FONT;
  } catch {
    return DEFAULT_FONT;
  }
}

// Inject the Google Fonts <link> once per href (it does not accumulate across repeated switches).
// Embedding the href in an attribute selector breaks depending on the family name (`"` etc.),
// so dedup by scanning and comparing via getAttribute. This also picks up what the inline
// script (index.html) injected.
function ensureFontLink(href: string): void {
  if (typeof document === "undefined") return;
  for (const l of document.querySelectorAll("link[data-syokan-font]")) {
    if (l.getAttribute("href") === href) return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.syokanFont = "";
  document.head.appendChild(link);
}

function persistFont(font: Font): void {
  if (typeof window === "undefined") return;
  try {
    const preset = getFontPreset(font);
    window.localStorage.setItem(FONT_STORAGE_KEY, preset.value);
    window.localStorage.setItem(FONT_SANS_KEY, preset.sans);
    window.localStorage.setItem(FONT_MONO_KEY, preset.mono);
    const href = googleFontHref(preset);
    if (href) window.localStorage.setItem(FONT_HREF_KEY, href);
    else window.localStorage.removeItem(FONT_HREF_KEY);
  } catch {
    // where storage is unavailable, give up persisting (the font still applies for this session)
  }
}

/** Resolve the preset, dynamically load the Google font, and set --app-font-{sans,mono}. */
export function applyFont(font: Font): void {
  if (typeof document === "undefined") return;
  const preset = getFontPreset(font);
  const href = googleFontHref(preset);
  if (href) ensureFontLink(href);
  const root = document.documentElement;
  root.style.setProperty("--app-font-sans", preset.sans);
  root.style.setProperty("--app-font-mono", preset.mono);
}

/**
 * Persist the font selection to localStorage immediately while also syncing it to
 * the server (source of truth), and apply it to --app-font-*. Re-fetches the server
 * value on mount.
 */
export function useFont(): { font: Font; setFont: (font: Font) => void } {
  const [font, setFontState] = useState<Font>(getStoredFont);

  useEffect(() => {
    let alive = true;
    fetchSetting().then((s) => {
      if (!alive || !s) return;
      const next = isFont(s.font) ? s.font : DEFAULT_FONT;
      if (next !== getStoredFont()) setFontState(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Apply whenever the font settles and rewrite the FOUC cache too. This also runs on
  // mount, so a new version that changed the preset definition / Google URL is reflected
  // in the next reload's inline script.
  useEffect(() => {
    applyFont(font);
    persistFont(font);
  }, [font]);

  const setFont = useCallback((next: Font) => {
    // Normalize first so that even an unknown value keeps state (highlight) and localStorage in sync.
    const value = isFont(next) ? next : DEFAULT_FONT;
    setFontState(value);
    void putSetting({ font: value });
  }, []);

  return { font, setFont };
}
