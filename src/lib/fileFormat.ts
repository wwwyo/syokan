// ファイルパスから描画形式を推論する。CLI(将来 dedup key に使う場合)と client render の
// 双方がこの 1 規則を引くことで推論の drift を防ぐ (FR-2/3)。client bundle に node:path を
// 持ち込まないため path util も純粋な文字列処理で持つ。

export type FileFormat = "markdown" | "text" | "code";

/** path の basename を返す (`/` と `\` の両方を区切りに扱い、末尾区切りは除く)。 */
export function fileBasename(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const i = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return i >= 0 ? trimmed.slice(i + 1) : trimmed;
}

// 先頭の `.` のみのファイル (dotfile) は拡張子なし扱い。`a.md` は md。
function extOf(path: string): string {
  const base = fileBasename(path);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/**
 * 拡張子から描画形式を推論する。`.md`/`.markdown`→markdown、`.json`→code、
 * それ以外 (`.txt`/`.log`/未知/拡張子なし) は text。
 */
export function inferFileFormat(path: string): FileFormat {
  const ext = extOf(path);
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "json") return "code";
  return "text";
}

/** code 形式で Code に渡す lang。拡張子をそのまま言語候補にする (Shiki が alias 解決する)。 */
export function codeLangForPath(path: string): string {
  return extOf(path) || "text";
}
