import { en, type Messages } from "./en";
import { ja } from "./ja";

// A minimal typed i18n with no added dependencies. The display language is resolved
// once at startup and never changed afterward (no switch UI; it follows the browser language).
export type Lang = "en" | "ja";

// Judging by mere "is it present" while ignoring priority would give a user who
// prefers English a Japanese UI. Scan from the front and adopt the first tag that
// matches a supported language (skip unsupported tags).
export function detectLang(languages: readonly string[]): Lang {
  for (const tag of languages) {
    const lower = tag.toLowerCase();
    if (lower.startsWith("ja")) return "ja";
    if (lower.startsWith("en")) return "en";
  }
  return "en";
}

// In non-browser (test / SSR) navigator is absent or incomplete, so return empty and fall to en
function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (navigator.languages && navigator.languages.length > 0) {
    return navigator.languages;
  }
  return navigator.language ? [navigator.language] : [];
}

/** The display language, resolved once at startup. */
export const lang: Lang = detectLang(browserLanguages());

// Dynamic import is avoided: components like ThemeSelect read t.* at module
// evaluation time (top level), and async resolution would reference an unresolved t
// and crash (verified on a real machine). Use static imports to bundle both languages.
export const t: Messages = lang === "ja" ? ja : en;

export type { Messages };
