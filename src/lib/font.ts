import { useCallback, useEffect, useState } from "react";
import { DEFAULT_FONT, getFontPreset, googleFontHref, isFontValue } from "./fonts";
import { fetchSetting, putSetting } from "./setting";

// 保存するのはプリセットの value (識別子)。実フォントは fonts.ts のプリセット表が解決する。
export type Font = string;

// index.html の inline script (FOUC 防止) と同じ key。両者は同じ規則で動く必要がある。
export const FONT_STORAGE_KEY = "syokan:font";
// FOUC 用に解決済みスタック / href も保存する。inline script はプリセット表 (TS) を
// import できないので、描画前にこのキャッシュを読んで CSS 変数設定 + link 注入する。
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

// Google Fonts の <link> を href 単位で一度だけ注入する (切替を繰り返しても増えない)。
// href を属性セレクタに埋めると family 名次第で壊れる (`"` 等) ので、走査して
// getAttribute 比較で dedup する。inline script (index.html) が注入した分も拾える。
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
    // storage 不可環境では永続化を諦める (フォント自体は当 session で効く)
  }
}

/** プリセットを解決し、Google フォントを動的読込しつつ --app-font-{sans,mono} を設定する。 */
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
 * フォント選択を localStorage に即時永続化しつつサーバー (正本) にも同期し、
 * --app-font-* に反映する。mount 時にサーバー値を取り直す。
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

  // font が決まるたびに適用し、FOUC 用キャッシュも書き直す。mount 時にも走るので、
  // プリセット定義 / Google URL を変えた新版でも次回 reload の inline script に反映される。
  useEffect(() => {
    applyFont(font);
    persistFont(font);
  }, [font]);

  const setFont = useCallback((next: Font) => {
    // 未知値でも state(highlight) と localStorage が食い違わないよう先に正規化する。
    const value = isFont(next) ? next : DEFAULT_FONT;
    setFontState(value);
    void putSetting({ font: value });
  }, []);

  return { font, setFont };
}
