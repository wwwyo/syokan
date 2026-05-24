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
