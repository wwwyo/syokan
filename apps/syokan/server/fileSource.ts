import { type FSWatcher, watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";

// Enough for viewing markdown / logs, but caps out so a huge file can't freeze the browser. Over the limit, the body is not returned.
export const FILE_SIZE_LIMIT = 2 * 1024 * 1024;

// Grace period between a view closing and the watcher being released. A reload drops the SSE and
// re-opens it right away, so releasing immediately would tear down and rebuild the watcher every time. The grace period absorbs reloads (US-002).
const RELEASE_DELAY_MS = 10_000;
// Coalesce a burst of events (rename + change, etc.) into one (curbs the client's repeated refetches).
const NOTIFY_DEBOUNCE_MS = 50;
// After a rename (inode swap), the wait before re-arming on the new inode. The path vanishes for a
// moment during the rename, so we wait a bit before re-watching.
const REARM_DELAY_MS = 10;
// When re-arming, if the path isn't there yet (rename in progress, etc.), retry a few times. An editor's atomic save
// makes the replacement appear right after, so a few tries re-arm it. The cap prevents infinite retries on a delete-only case.
const REARM_MAX_ATTEMPTS = 5;

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
 * binary or non-UTF-8 don't return unreadable content — they become classified failures (FR-9~12).
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
  // Directory / FIFO / socket / device are not regular files (FR-9).
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
  // Contains NUL or can't be UTF-8 decoded → don't emit unreadable content (FR-12).
  if (buf.includes(0)) return { ok: false, reason: "not_text" };
  try {
    const content = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return { ok: true, content };
  } catch {
    return { ok: false, reason: "not_text" };
  }
}

export type FileWatcher = {
  /** Subscribe to changes on path. The return value unsubscribes. One SSE connection = one subscription. */
  subscribe: (path: string, onChange: () => void) => () => void;
  /** For tests: the number of paths currently holding an fs.watch. */
  activeCount: () => number;
  /** For tests: destroy all watchers immediately without waiting for the release timeout. */
  closeAll: () => void;
};

type WatchEntry = {
  watcher: FSWatcher | null;
  subs: Set<() => void>;
  releaseTimer?: ReturnType<typeof setTimeout>;
  notifyTimer?: ReturnType<typeof setTimeout>;
  rearmTimer?: ReturnType<typeof setTimeout>;
};

/**
 * fs.watch each file per path and notify subscribers of changes. Watchers are in-memory
 * runtime state — never persisted.
 *
 * A "temp write → rename" save (FR-5) swaps the file's inode, so watching naively loses track of
 * changes after the swap. On macOS, watching the parent directory doesn't fire on content changes
 * inside it, so we watch the file itself and, on a `rename` event (the signal for inode swap
 * /deletion), re-arm the watch on the same path to keep following it.
 */
export function createFileWatcher(opts?: {
  releaseDelayMs?: number;
  notifyDebounceMs?: number;
  rearmDelayMs?: number;
}): FileWatcher {
  const releaseDelayMs = opts?.releaseDelayMs ?? RELEASE_DELAY_MS;
  const notifyDebounceMs = opts?.notifyDebounceMs ?? NOTIFY_DEBOUNCE_MS;
  const rearmDelayMs = opts?.rearmDelayMs ?? REARM_DELAY_MS;
  const entries = new Map<string, WatchEntry>();

  function notify(path: string): void {
    const entry = entries.get(path);
    if (!entry || entry.notifyTimer) return;
    entry.notifyTimer = setTimeout(() => {
      entry.notifyTimer = undefined;
      for (const cb of entry.subs) cb();
    }, notifyDebounceMs);
    entry.notifyTimer.unref?.();
  }

  function armWatch(path: string): FSWatcher | null {
    try {
      const w = watch(path, (event) => {
        notify(path);
        // rename = inode swap/deletion. Re-arm on the same path to follow the new inode.
        if (event === "rename") rearm(path);
      });
      // An error (e.g. deleted while watching) also attempts a re-arm, same as rename.
      w.on("error", () => rearm(path));
      w.unref?.();
      return w;
    } catch {
      // Can't arm the watch (path missing, etc.). Subscriptions are accepted but there are no live updates.
      return null;
    }
  }

  function rearm(path: string, attempt = 0): void {
    const entry = entries.get(path);
    if (!entry || entry.rearmTimer) return;
    try {
      entry.watcher?.close();
    } catch {
      // already closed
    }
    entry.watcher = null;
    entry.rearmTimer = setTimeout(() => {
      entry.rearmTimer = undefined;
      const cur = entries.get(path);
      if (!cur || cur.subs.size === 0) return;
      cur.watcher = armWatch(path);
      // If still un-armable (replacement not yet present), retry up to the cap. Once armed, a change
      // may have been missed, so notify once to make the client re-fetch.
      if (!cur.watcher) {
        if (attempt + 1 < REARM_MAX_ATTEMPTS) rearm(path, attempt + 1);
      } else if (attempt > 0) {
        notify(path);
      }
    }, rearmDelayMs);
    entry.rearmTimer.unref?.();
  }

  function subscribe(path: string, onChange: () => void): () => void {
    let entry = entries.get(path);
    if (!entry) {
      entry = { watcher: armWatch(path), subs: new Set() };
      entries.set(path, entry);
    } else if (entry.releaseTimer) {
      clearTimeout(entry.releaseTimer);
      entry.releaseTimer = undefined;
    }
    entry.subs.add(onChange);

    return () => {
      const e = entries.get(path);
      if (!e) return;
      e.subs.delete(onChange);
      if (e.subs.size > 0) return;
      e.releaseTimer = setTimeout(() => {
        const cur = entries.get(path);
        if (!cur || cur.subs.size > 0) return;
        cur.watcher?.close();
        if (cur.notifyTimer) clearTimeout(cur.notifyTimer);
        if (cur.rearmTimer) clearTimeout(cur.rearmTimer);
        entries.delete(path);
      }, releaseDelayMs);
      e.releaseTimer.unref?.();
    };
  }

  function closeAll(): void {
    for (const e of entries.values()) {
      if (e.releaseTimer) clearTimeout(e.releaseTimer);
      if (e.notifyTimer) clearTimeout(e.notifyTimer);
      if (e.rearmTimer) clearTimeout(e.rearmTimer);
      e.watcher?.close();
    }
    entries.clear();
  }

  return { subscribe, activeCount: () => entries.size, closeAll };
}
