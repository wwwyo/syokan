import { en, type Messages } from "./en";
import { ja } from "./ja";

// 依存を増やさない最小の typed i18n。表示言語は起動時に 1 度だけ解決し、
// 以後は変えない (切替 UI は持たず、ブラウザ言語に従う)。
export type Lang = "en" | "ja";

// 優先順位を無視して "含まれるか" だけで判定すると、英語を第一希望にした
// ユーザーが日本語 UI にされてしまう。先頭から見て最初に対応言語と一致した
// ものを採用する (未対応タグはスキップ)。
export function detectLang(languages: readonly string[]): Lang {
  for (const tag of languages) {
    const lower = tag.toLowerCase();
    if (lower.startsWith("ja")) return "ja";
    if (lower.startsWith("en")) return "en";
  }
  return "en";
}

// 非ブラウザ (test / SSR) では navigator が無い・不完全なので空にして en へ落とす
function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (navigator.languages && navigator.languages.length > 0) {
    return navigator.languages;
  }
  return navigator.language ? [navigator.language] : [];
}

/** 起動時に 1 度だけ解決した表示言語。 */
export const lang: Lang = detectLang(browserLanguages());

// dynamic import は見送り: ThemeSelect などが t.* をモジュール評価時点
// (トップレベル) で読んでおり、非同期解決だと未解決の t を参照してクラッシュする
// (実機確認済み)。static import で両言語ともバンドルに含める。
export const t: Messages = lang === "ja" ? ja : en;

export type { Messages };
