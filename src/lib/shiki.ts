import type { Highlighter } from "shiki";
import { createHighlighter } from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

const LIGHT_THEME = "github-light";
const DARK_THEME = "github-dark";

const LANGS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "jsonc",
  "bash",
  "shell",
  "html",
  "css",
  "markdown",
  "python",
  "go",
  "rust",
  "yaml",
  "toml",
  "sql",
  "diff",
] as const;

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [LIGHT_THEME, DARK_THEME],
      langs: [...LANGS],
      // WASM (oniguruma) を避けて bundler / browser で素直に動く JS engine を使う
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
}

export async function highlightToHtml(
  code: string,
  lang?: string,
): Promise<string> {
  const hl = await getHighlighter();
  const loaded = new Set(hl.getLoadedLanguages());
  const resolved = lang && loaded.has(lang) ? lang : "text";
  return hl.codeToHtml(code, {
    lang: resolved,
    themes: { light: LIGHT_THEME, dark: DARK_THEME },
    // dark/light の出し分けは styles.css 側の CSS 変数で行う
    defaultColor: false,
  });
}

// 拡張子 → shiki 言語 ID。値は必ず LANGS のいずれか (= ハイライト可能) にする。
const EXT_TO_LANG: Record<string, string> = {
  ts: "ts",
  mts: "ts",
  cts: "ts",
  tsx: "tsx",
  js: "js",
  mjs: "js",
  cjs: "js",
  jsx: "jsx",
  json: "json",
  jsonc: "jsonc",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  html: "html",
  htm: "html",
  css: "css",
  md: "markdown",
  markdown: "markdown",
  py: "python",
  go: "go",
  rs: "rust",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  sql: "sql",
  diff: "diff",
  patch: "diff",
};

// コードフェンスの info string を言語 ID とファイル名に解釈する。
// `.` を含めばファイル名とみなし拡張子から lang を推定する
// (例: "hoge.json" → { lang: "json", filename: "hoge.json" })。
// `.` が無ければ従来どおり言語 ID 扱い (例: "ts" → { lang: "ts" })。
// 未知拡張子 (例: "notes.xyz") は lang を付けず filename だけ返し、highlight は
// text フォールバックさせる。
export function resolveCodeInfo(info?: string): {
  lang?: string;
  filename?: string;
} {
  if (!info) return {};
  if (info.includes(".")) {
    const ext = info.slice(info.lastIndexOf(".") + 1).toLowerCase();
    return { lang: EXT_TO_LANG[ext], filename: info };
  }
  return { lang: info };
}
