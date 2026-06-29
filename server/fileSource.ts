import { type FSWatcher, watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";

// markdown / log 閲覧に十分で、巨大ファイルでブラウザを固めない上限。超過は本文を返さない。
export const FILE_SIZE_LIMIT = 2 * 1024 * 1024;

// view を閉じてから watcher を解放するまでの猶予。reload は SSE を一旦切ってすぐ張り直す
// ため、即解放だと watcher を毎回壊して作り直す。猶予で reload を吸収する (US-002)。
const RELEASE_DELAY_MS = 10_000;
// rename + change 等の連続イベントを 1 回に束ねる (client の連続 refetch を抑える)。
const NOTIFY_DEBOUNCE_MS = 50;
// rename (inode 差し替え) 後、新 inode に張り直すまでの待ち。rename の隙間で path が
// 一瞬消えるため少し待ってから再 watch する。
const REARM_DELAY_MS = 10;

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
 * path を UTF-8 テキストとして読む。通常ファイルでない・欠落・権限不足・サイズ超過・
 * バイナリ/非 UTF-8 は読めない内容を返さず分類された失敗にする (FR-9〜12)。
 * symlink は stat が辿るので、リンク先が通常ファイルなら読める。
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
  // ディレクトリ / FIFO / socket / device は通常ファイルでない (FR-9)。
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
  // NUL を含む or UTF-8 デコード不能 → 読めない内容を出さない (FR-12)。
  if (buf.includes(0)) return { ok: false, reason: "not_text" };
  try {
    const content = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return { ok: true, content };
  } catch {
    return { ok: false, reason: "not_text" };
  }
}

export type FileWatcher = {
  /** path の変更を購読する。返り値で解除。SSE 接続 1 本 = 購読 1 件。 */
  subscribe: (path: string, onChange: () => void) => () => void;
  /** test 用: 現在 fs.watch を保持している path 数。 */
  activeCount: () => number;
  /** test 用: release timeout を待たず全 watcher を即時破棄する。 */
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
 * path ごとにファイルを fs.watch し、購読者へ変更を通知する。watcher は in-memory の
 * runtime state で永続化しない。
 *
 * 「temp 書き込み → rename」保存 (FR-5) はファイルの inode を差し替えるため、素朴に
 * watch したままだと差し替え後の変更を見失う。macOS では親ディレクトリ watch が中の
 * ファイル変更で発火しないため、ファイル自身を watch し、`rename` イベント (inode 差し替え
 * /削除のシグナル) を受けたら同じ path に watch を張り直す (re-arm) ことで追従する。
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
        // rename = inode 差し替え/削除。同じ path に張り直して新 inode を追う。
        if (event === "rename") rearm(path);
      });
      // 監視中に削除された等の error も rename と同様に再 arm を試みる。
      w.on("error", () => rearm(path));
      w.unref?.();
      return w;
    } catch {
      // path が無い等で watch を張れない。購読は受けるが live 更新はしない。
      return null;
    }
  }

  function rearm(path: string): void {
    const entry = entries.get(path);
    if (!entry || entry.rearmTimer) return;
    try {
      entry.watcher?.close();
    } catch {
      // 既に閉じている
    }
    entry.watcher = null;
    entry.rearmTimer = setTimeout(() => {
      entry.rearmTimer = undefined;
      const cur = entries.get(path);
      if (!cur || cur.subs.size === 0) return;
      cur.watcher = armWatch(path);
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
