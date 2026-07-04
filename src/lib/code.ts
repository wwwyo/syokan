// @pierre/diffs (Shiki) に渡して安全にハイライトできる言語 / alias。
// 未知の lang を File に渡すと例外も出さず空描画になる (silent) ため、
// このリストに無いものは "text" にフォールバックして生テキストを必ず出す。
const SUPPORTED_LANGS = new Set([
  "ts", "tsx", "typescript", "js", "jsx", "javascript", "mjs", "cjs",
  "json", "jsonc", "json5",
  "bash", "sh", "shell", "shellscript", "zsh",
  "html", "xml", "svg",
  "css", "scss", "sass", "less",
  "markdown", "md", "mdx",
  "python", "py",
  "go", "rust", "rs",
  "yaml", "yml", "toml", "ini",
  "sql", "graphql", "diff", "proto", "protobuf",
  "c", "cpp", "java", "kotlin", "kt", "swift",
  "ruby", "rb", "php", "dockerfile", "make", "makefile",
  "vue", "svelte", "astro", "text", "plaintext", "txt",
]);

/**
 * lang を @pierre/diffs (Shiki) が確実に扱える値に正規化する。
 * 未知の lang は "text" に落とす (素テキストとして表示し、空描画やエラーを防ぐ)。
 */
export function toCodeLang(lang?: string): string {
  if (!lang) return "text";
  return SUPPORTED_LANGS.has(lang.toLowerCase()) ? lang : "text";
}

/**
 * コードフェンスの info string を言語 ID とファイル名に解釈する。
 * `.` を含めばファイル名とみなし、拡張子をそのまま言語候補にする
 * (例: "hoge.json" → { lang: "json", filename: "hoge.json" })。py/yml/ts/rs/md/sh
 * 等の主要拡張子は Shiki が言語 alias として解決するので、専用の拡張子→言語マップは
 * 持たない。`.` が無ければ言語 ID 扱い (例: "ts" → { lang: "ts" })。
 */
export function resolveCodeInfo(info?: string): {
  lang?: string;
  filename?: string;
} {
  if (!info) return {};
  if (info.includes(".")) {
    const ext = info.slice(info.lastIndexOf(".") + 1).toLowerCase();
    return { lang: ext || undefined, filename: info };
  }
  return { lang: info };
}
