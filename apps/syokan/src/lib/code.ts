// Languages / aliases that @pierre/diffs (Shiki) can safely highlight.
// An unknown lang passed to File renders empty without throwing (silent), so
// anything not in this list falls back to "text" to always show the raw text.
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
 * Normalize lang to a value @pierre/diffs (Shiki) can reliably handle.
 * Unknown langs fall to "text" (shown as raw text, avoiding empty renders or errors).
 */
export function toCodeLang(lang?: string): string {
  if (!lang) return "text";
  return SUPPORTED_LANGS.has(lang.toLowerCase()) ? lang : "text";
}

/**
 * Interpret a code fence's info string as a language ID and a filename.
 * If it contains `.`, treat it as a filename and use the extension as-is as the
 * language candidate (e.g. "hoge.json" → { lang: "json", filename: "hoge.json" }).
 * Shiki resolves major extensions like py/yml/ts/rs/md/sh as language aliases, so
 * there is no dedicated extension→language map. Without a `.` it is treated as a
 * language ID (e.g. "ts" → { lang: "ts" }).
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
