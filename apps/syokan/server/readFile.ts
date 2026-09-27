import { readFile, stat } from "node:fs/promises";

// Caps out so a huge file can't freeze a scan. Over the limit, the body is not returned.
export const FILE_SIZE_LIMIT = 2 * 1024 * 1024;

export type ReadFileFailure =
  | "not_found"
  | "not_regular_file"
  | "permission_denied"
  | "too_large"
  | "not_text";

export type ReadFileResult =
  | { ok: true; content: string }
  | { ok: false; reason: ReadFileFailure };

function errno(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | undefined)?.code;
}

/**
 * Read path as UTF-8 text. Non-regular file / missing / permission denied / over size /
 * binary or non-UTF-8 don't return unreadable content — they become classified failures.
 * stat follows symlinks, so a symlink is readable when its target is a regular file.
 */
export async function readTextFile(path: string): Promise<ReadFileResult> {
  let st: Awaited<ReturnType<typeof stat>>;
  try {
    st = await stat(path);
  } catch (err) {
    const code = errno(err);
    if (code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP") {
      return { ok: false, reason: "not_found" };
    }
    if (code === "EACCES" || code === "EPERM") {
      return { ok: false, reason: "permission_denied" };
    }
    throw err;
  }
  // Directory / FIFO / socket / device are not regular files.
  if (!st.isFile()) return { ok: false, reason: "not_regular_file" };
  if (st.size > FILE_SIZE_LIMIT) return { ok: false, reason: "too_large" };

  let buf: Buffer;
  try {
    buf = await readFile(path);
  } catch (err) {
    const code = errno(err);
    if (code === "ENOENT") return { ok: false, reason: "not_found" };
    if (code === "EACCES" || code === "EPERM") {
      return { ok: false, reason: "permission_denied" };
    }
    if (code === "EISDIR") return { ok: false, reason: "not_regular_file" };
    throw err;
  }
  // Contains NUL or can't be UTF-8 decoded → don't emit unreadable content.
  if (buf.includes(0)) return { ok: false, reason: "not_text" };
  try {
    const content = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return { ok: true, content };
  } catch {
    return { ok: false, reason: "not_text" };
  }
}
