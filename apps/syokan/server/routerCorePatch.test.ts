import { describe, expect, test } from "bun:test";
import path from "node:path";

/**
 * Guards the `bun patch` applied to `@tanstack/router-core` (see
 * `patches/@tanstack%2Frouter-core@1.171.27.patch` and `patchedDependencies`
 * in the root package.json).
 *
 * Why this exists: Bun's HMR dev server links ESM modules in one phase, so
 * when two modules import each other at the top level, one side can still be
 * `null` when the other reads it during module evaluation (oven-sh/bun#40248;
 * fix oven-sh/bun#40259 is unmerged, not in bun 1.4.2). `@tanstack/router-core`
 * has exactly this cycle between `router.js` and `load-client.js`: `router.js`
 * does `RouterCore.prototype._replaceRouteChunk = replaceRouteChunk;` at
 * module-evaluation time, eagerly reading a binding from the other side of the
 * cycle. When that binding is still `null`, the dev page goes blank with
 * `Cannot read properties of null (reading 'replaceRouteChunk')`. The patch
 * wraps the assignment in a function so the read is deferred until the method
 * is actually called (nothing in syokan calls `_replaceRouteChunk` itself —
 * it's a hook for TanStack's Vite HMR plugin).
 *
 * Why a test, not just the patch file: `bun install` silently ignores a
 * `patchedDependencies` entry whose `name@version` key no longer matches the
 * installed version (a name-only key is not applied either), so a dependabot
 * bump of `@tanstack/router-core` can drop the patch with no error — the dev
 * page just goes blank again with no signal in CI. This test reads the
 * installed package's actual `router.js` and fails loudly if the eager read
 * is back.
 *
 * Remediation on failure:
 * - If (a) fails (the eager, unpatched form is present again): the version
 *   bumped and `patchedDependencies` no longer matches, so bun skipped the
 *   patch. Run `bun patch @tanstack/router-core`, re-apply the one-line wrap
 *   from the diff above, `bun patch --commit node_modules/@tanstack/router-core`,
 *   then delete the old patch file and update the `patchedDependencies` key.
 * - Once the mise-pinned bun ships oven-sh/bun#40259, delete the patch file,
 *   the `patchedDependencies` entry, and this test.
 */
describe("router-core HMR cycle patch", () => {
  test("router.js does not eagerly read _replaceRouteChunk across the import cycle", async () => {
    const entry = Bun.resolveSync("@tanstack/router-core", import.meta.dir);
    const routerJsPath = path.join(path.dirname(entry), "router.js");
    const source = await Bun.file(routerJsPath).text();

    if (!source.includes("replaceRouteChunk")) {
      // Upstream no longer has this shape at all — the cycle (or this
      // specific assignment) is gone, so there's nothing left to guard.
      // The patch and this test can be deleted.
      return;
    }

    const eagerReadPattern =
      /^\s*RouterCore\.prototype\._replaceRouteChunk\s*=\s*replaceRouteChunk;/m;
    expect(
      eagerReadPattern.test(source),
      `${routerJsPath} contains the eager 'RouterCore.prototype._replaceRouteChunk = replaceRouteChunk;' assignment. ` +
        "This means the bun patch was dropped (likely a router-core version bump whose new version no longer " +
        "matches the patchedDependencies key). Re-run 'bun patch @tanstack/router-core', re-apply the lazy-wrap " +
        "fix, and 'bun patch --commit node_modules/@tanstack/router-core'.",
    ).toBe(false);

    const lazyWrapPattern = /_replaceRouteChunk\s*=\s*function/;
    expect(
      lazyWrapPattern.test(source),
      `${routerJsPath} contains 'replaceRouteChunk' but neither the known eager form nor the known patched ` +
        "lazy-function form. The upstream shape changed; re-inspect router.js and update the patch accordingly.",
    ).toBe(true);
  });
});
