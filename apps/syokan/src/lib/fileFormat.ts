// Infer the render format from a file path. Both the CLI (should it use this as a
// dedup key in the future) and client render draw on this single rule to prevent
// inference drift (FR-2/3). To avoid pulling node:path into the client bundle, the
// path util is kept as pure string processing.

export type FileFormat = "markdown" | "text" | "code";

/** Return the path's basename (treating both `/` and `\` as separators, trailing separators stripped). */
export function fileBasename(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const i = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return i >= 0 ? trimmed.slice(i + 1) : trimmed;
}

// Files with only a leading `.` (dotfiles) are treated as having no extension. `a.md` is md.
function extOf(path: string): string {
  const base = fileBasename(path);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/**
 * Infer the render format from the extension. `.md`/`.markdown`→markdown, `.json`→code,
 * everything else (`.txt`/`.log`/unknown/no extension) → text.
 */
export function inferFileFormat(path: string): FileFormat {
  const ext = extOf(path);
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "json") return "code";
  return "text";
}

/** The lang passed to Code in code format. Uses the extension as-is as the language candidate (Shiki resolves the alias). */
export function codeLangForPath(path: string): string {
  return extOf(path) || "text";
}
