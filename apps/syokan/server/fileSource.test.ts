import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createFileWatcher,
  FILE_SIZE_LIMIT,
  readTextFile,
} from "./fileSource";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "syokan-fs-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function waitFor(
  predicate: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) {
        return reject(new Error("waitFor timed out"));
      }
      setTimeout(tick, 20);
    };
    tick();
  });
}

// Re-arming after a rename (inode swap) assumes macOS fs.watch behavior (AGENTS.md pitfall #7).
// On Linux (inotify) watching the file itself doesn't fire on an inode swap, so it doesn't hold.
// Run only on the target macOS (the in-place-change watcher tests run on all OSes).
const rearmOnRename = process.platform === "darwin";

describe("readTextFile", () => {
  test("reads a UTF-8 file", async () => {
    const p = join(dir, "a.md");
    await writeFile(p, "# Heading\nBody");
    const r = await readTextFile(p);
    expect(r).toEqual({ ok: true, content: "# Heading\nBody" });
  });

  test("missing file → not_found", async () => {
    const r = await readTextFile(join(dir, "nope.md"));
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });

  test("directory → not_regular_file", async () => {
    const r = await readTextFile(dir);
    expect(r).toEqual({ ok: false, reason: "not_regular_file" });
  });

  test("over the size limit → too_large", async () => {
    const p = join(dir, "big.log");
    await writeFile(p, "x".repeat(FILE_SIZE_LIMIT + 1));
    const r = await readTextFile(p);
    expect(r).toEqual({ ok: false, reason: "too_large" });
  });

  test("binary (NUL bytes) → not_text", async () => {
    const p = join(dir, "bin");
    await writeFile(p, Buffer.from([0x48, 0x00, 0x49]));
    const r = await readTextFile(p);
    expect(r).toEqual({ ok: false, reason: "not_text" });
  });

  test("invalid UTF-8 → not_text", async () => {
    const p = join(dir, "bad");
    await writeFile(p, Buffer.from([0xff, 0xfe, 0xfd]));
    const r = await readTextFile(p);
    expect(r).toEqual({ ok: false, reason: "not_text" });
  });

  test("symlink to a regular file is followed", async () => {
    const target = join(dir, "real.md");
    const link = join(dir, "link.md");
    await writeFile(target, "linked");
    await symlink(target, link);
    const r = await readTextFile(link);
    expect(r).toEqual({ ok: true, content: "linked" });
  });
});

describe("createFileWatcher", () => {
  test("notifies subscribers when the file changes", async () => {
    const p = join(dir, "watch.txt");
    await writeFile(p, "v1");
    const watcher = createFileWatcher({ notifyDebounceMs: 5 });
    let hits = 0;
    const unsub = watcher.subscribe(p, () => {
      hits += 1;
    });
    await writeFile(p, "v2");
    await waitFor(() => hits >= 1);
    unsub();
    watcher.closeAll();
  });

  test.skipIf(!rearmOnRename)("survives temp-write→rename (editor save) via re-arm on rename", async () => {
    const p = join(dir, "doc.md");
    await writeFile(p, "v1");
    const watcher = createFileWatcher({ notifyDebounceMs: 5 });
    let hits = 0;
    const unsub = watcher.subscribe(p, () => {
      hits += 1;
    });
    // Editor-style: write a separate file and swap it in via rename (inode swap).
    const tmp = join(dir, "doc.md.tmp");
    await writeFile(tmp, "v2");
    await rename(tmp, p);
    await waitFor(() => hits >= 1);
    unsub();
    watcher.closeAll();
  });

  test.skipIf(!rearmOnRename)("re-arms across a brief gap where the path momentarily disappears", async () => {
    const p = join(dir, "gap.md");
    await writeFile(p, "v1");
    const watcher = createFileWatcher({ notifyDebounceMs: 5, rearmDelayMs: 15 });
    let hits = 0;
    const unsub = watcher.subscribe(p, () => {
      hits += 1;
    });
    // Wait for the watch to be established.
    await new Promise((r) => setTimeout(r, 60));
    // Mimic a save that unlinks → recreates after a short pause. The delete's rename re-arms,
    // and the replacement appearing re-attaches the watch.
    await rm(p);
    await new Promise((r) => setTimeout(r, 8));
    await writeFile(p, "v2");
    // Wait for the re-arm to re-attach on the new inode.
    await new Promise((r) => setTimeout(r, 80));
    // Picking up an in-place write after re-attach is proof the re-arm succeeded.
    const before = hits;
    await writeFile(p, "v3");
    await waitFor(() => hits > before);
    unsub();
    watcher.closeAll();
  });

  test("refcounts: multiple subs share one watcher; releases after timeout", async () => {
    const p = join(dir, "shared.txt");
    await writeFile(p, "v1");
    const watcher = createFileWatcher({ releaseDelayMs: 30, notifyDebounceMs: 5 });
    const unsubA = watcher.subscribe(p, () => {});
    const unsubB = watcher.subscribe(p, () => {});
    expect(watcher.activeCount()).toBe(1);
    unsubA();
    // Don't release while one remains.
    expect(watcher.activeCount()).toBe(1);
    unsubB();
    // refcount 0 → released after the release timeout.
    await waitFor(() => watcher.activeCount() === 0);
    watcher.closeAll();
  });

  test("re-subscribing within the release window cancels the release", async () => {
    const p = join(dir, "regrab.txt");
    await writeFile(p, "v1");
    const watcher = createFileWatcher({ releaseDelayMs: 100, notifyDebounceMs: 5 });
    const unsub = watcher.subscribe(p, () => {});
    unsub();
    // Re-subscribing before the release timeout doesn't rebuild the watcher.
    const unsub2 = watcher.subscribe(p, () => {});
    await new Promise((r) => setTimeout(r, 150));
    expect(watcher.activeCount()).toBe(1);
    unsub2();
    watcher.closeAll();
  });
});
