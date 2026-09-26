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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

/**
 * fs.watch arms asynchronously — on macOS the OS-level watch goes live tens of ms after
 * subscribe() returns, and a change landing in that gap is dropped forever (the macOS CI
 * flake: a test's single write raced arming and nothing ever arrived). Repeat the mutation
 * until a notification is observed, so tests synchronize on delivery, not on a guessed delay.
 */
async function mutateUntilNotified(
  mutate: () => Promise<unknown>,
  notified: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!notified()) {
    if (Date.now() > deadline) {
      throw new Error("mutateUntilNotified timed out — no fs event was ever delivered");
    }
    await mutate();
    await sleep(40);
  }
}

/**
 * Drain delayed/coalesced notifications: resolve once the count stays flat for `quietMs`.
 * Phase assertions snapshot `hits` as a baseline — a notification lagging its own mutation
 * (e.g. a Linux dir watch reports the temp write AND the rename as separate events) must not
 * be counted toward the next phase.
 */
async function settledHits(
  hits: () => number,
  quietMs = 60,
  timeoutMs = 2000,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let prev = -1;
  while (Date.now() <= deadline) {
    await sleep(quietMs);
    const cur = hits();
    if (cur === prev) return cur;
    prev = cur;
  }
  throw new Error("settledHits timed out — notifications never stopped arriving");
}

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
    // A one-shot write can land before the OS watch is armed and be silently dropped.
    let v = 1;
    await mutateUntilNotified(() => writeFile(p, `v${++v}`), () => hits > 0);
    unsub();
    watcher.closeAll();
  });

  // Whatever keeps the watch alive across an inode swap (Linux dir watch; macOS re-arm — or
  // path-granular FSEvents, which survives a swap on its own), the observable spec is the same:
  // an editor-style save keeps notifying.
  test("survives temp-write→rename (editor save)", async () => {
    const p = join(dir, "doc.md");
    await writeFile(p, "v1");
    const watcher = createFileWatcher({ notifyDebounceMs: 5 });
    let hits = 0;
    const unsub = watcher.subscribe(p, () => {
      hits += 1;
    });
    // Establish the watch before the swap so the swap can't race arming; drain lagged
    // establish-phase events so the baseline can't be crossed by a stale notification.
    let v = 1;
    await mutateUntilNotified(() => writeFile(p, `v${++v}`), () => hits > 0);
    const established = await settledHits(() => hits);
    // Editor-style: write a separate file and swap it in via rename (inode swap).
    const tmp = join(dir, "doc.md.tmp");
    await writeFile(tmp, "v2");
    await rename(tmp, p);
    // The transition's events (temp write + rename are separate on a Linux dir watch) all
    // land before the post-swap baseline, so only a post-swap write can raise `hits` past it.
    await waitFor(() => hits > established);
    const afterSwap = await settledHits(() => hits);
    // Only a watch that still follows the path after the swap can deliver these.
    await mutateUntilNotified(
      () => writeFile(p, `v${++v}`),
      () => hits > afterSwap,
    );
    unsub();
    watcher.closeAll();
  });

  test("keeps following across a brief gap where the path momentarily disappears", async () => {
    const p = join(dir, "gap.md");
    await writeFile(p, "v1");
    const watcher = createFileWatcher({ notifyDebounceMs: 5, rearmDelayMs: 15 });
    let hits = 0;
    const unsub = watcher.subscribe(p, () => {
      hits += 1;
    });
    // Establish the watch before removing the file, then drain so the baseline is clean.
    let v = 1;
    await mutateUntilNotified(() => writeFile(p, `v${++v}`), () => hits > 0);
    const established = await settledHits(() => hits);
    // Unlink and wait for its notification — with a clean baseline that can only be the
    // delete's own event, which is also what schedules the re-arm. The recreate then lands
    // either before the first re-arm attempt or inside the retry window; either way an
    // attempt must attach.
    await rm(p);
    await waitFor(() => hits > established);
    await writeFile(p, `v${++v}`);
    const afterRecreate = await settledHits(() => hits);
    // Only a watch that still follows the path can deliver these.
    await mutateUntilNotified(
      () => writeFile(p, `v${++v}`),
      () => hits > afterRecreate,
    );
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
    await sleep(150);
    expect(watcher.activeCount()).toBe(1);
    unsub2();
    watcher.closeAll();
  });
});
