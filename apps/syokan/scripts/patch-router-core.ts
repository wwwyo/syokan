#!/usr/bin/env bun
// Re-applies / re-targets the `bun patch` on @tanstack/router-core against the installed version.
//
// Why: `bun install` silently drops a `patchedDependencies` entry whose `name@version` key no
// longer matches the installed version, so every dependabot bump of router-core used to mean a
// manual `bun patch` → re-apply the lazy wrap → `bun patch --commit` → delete the stale patch
// file and package.json key. This script does all of it, verifies via the guard test, and fails
// loudly when the upstream code shape changed so the wrap can't be applied mechanically.
//
// Usage: bun run patch:router-core   (paths resolve off the repo root, cwd-independent)
import { existsSync } from "node:fs";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, delimiter, join } from "node:path";

const PKG = "@tanstack/router-core";
const PKG_KEY_PREFIX = `${PKG}@`;
const PATCH_FILE_PREFIX = "@tanstack%2Frouter-core@";
const repoRoot = join(import.meta.dir, "../../..");
const pkgDir = join(repoRoot, "node_modules", PKG);
const pkgDirRel = `node_modules/${PKG}`;
const routerJsPath = join(pkgDir, "dist/esm/router.js");
const rootPkgJsonPath = join(repoRoot, "package.json");
const patchesDir = join(repoRoot, "patches");

// `bun run` prepends node_modules/.bin to PATH, which shadows the mise-pinned toolchain with
// the npm `bun` package (e.g. 1.3.13 rewrites all of package.json where 1.4.x edits surgically).
// A bun running this script from outside node_modules is already the toolchain; otherwise take
// the first PATH bun that isn't inside node_modules.
const BUN_BIN_NAMES =
  process.platform === "win32" ? ["bun.exe", "bun"] : ["bun"];
function resolveBun(): string {
  if (
    BUN_BIN_NAMES.includes(basename(process.execPath).toLowerCase()) &&
    !process.execPath.includes("node_modules")
  ) {
    return process.execPath;
  }
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir || dir.includes("node_modules")) continue;
    for (const name of BUN_BIN_NAMES) {
      const cand = join(dir, name);
      if (existsSync(cand)) return cand;
    }
  }
  return process.execPath;
}
const BUN = resolveBun();

function fail(step: string, msg: string): never {
  console.error(`patch-router-core: FAIL at ${step}\n${msg}`);
  process.exit(1);
}

async function run(step: string, args: string[]): Promise<void> {
  const proc = Bun.spawn(args, {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) fail(step, `$ ${args.join(" ")}\n${out}${err}`);
  if (out.trim()) console.log(out.trim());
}

// The upstream statement the patch rewrites (inside the `NODE_ENV !== "production"` block):
//   RouterCore.prototype._replaceRouteChunk = replaceRouteChunk;
// It eagerly reads a binding across the router.js <-> load-client.js import cycle, which
// Bun's HMR linker hands as null (oven-sh/bun#40248). The patch wraps it in a function so the
// read is deferred to call time.
const EAGER_RE =
  /^([ \t]*)RouterCore\.prototype\._replaceRouteChunk\s*=\s*replaceRouteChunk;[ \t]*$/gm;
const LAZY_RE =
  /RouterCore\.prototype\._replaceRouteChunk\s*=\s*function\s*\(\s*route\s*,\s*lazyFn\s*\)/;

/**
 * Remove this package's stale `name@version` keys from a patchedDependencies block by editing
 * lines, so the rest of package.json keeps its exact formatting. A removed last entry leaves a
 * dangling comma on the previous line — that comma is stripped too. Returns null when the block
 * isn't one-entry-per-line (callers then decide; a leftover stale key is inert anyway).
 */
function dropStalePatchKeys(text: string, keepKey: string): string | null {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /"patchedDependencies"\s*:\s*\{/.test(l));
  const startLine = lines[start];
  // Bail unless the block opens with a bare `{` — an inline `{ "k": "v" }` shape is left alone.
  if (
    start === -1 ||
    startLine === undefined ||
    !/"patchedDependencies"\s*:\s*\{\s*$/.test(startLine)
  ) {
    return null;
  }
  const end = lines.findIndex(
    (l, i) => i > start && /^\s*\},?\s*$/.test(l),
  );
  if (end === -1) return null;

  const entryRe = /^\s*"(@tanstack\/router-core@[^"]+)":\s*"[^"]*",?\s*$/;
  const kept = lines.filter((l, i) => {
    if (i <= start || i >= end) return true;
    const key = l.match(entryRe)?.[1];
    return key === undefined || key === keepKey;
  });

  const closing = kept.findIndex(
    (l, i) => i > start && /^\s*\},?\s*$/.test(l),
  );
  for (let i = closing - 1; i > start; i--) {
    const l = kept[i];
    if (l === undefined || l.trim() === "") continue;
    kept[i] = l.replace(/,\s*$/, "");
    break;
  }
  return kept.join("\n");
}

/** package.json patchedDependencies → validated write; surgical edit first, JSON rewrite last. */
async function removeStaleEntries(
  keepKey: string | null,
): Promise<void> {
  const text = await readFile(rootPkgJsonPath, "utf8");
  const isStale = (k: string) =>
    k.startsWith(PKG_KEY_PREFIX) && k !== keepKey;
  const staleKeys = Object.keys(
    JSON.parse(text).patchedDependencies ?? {},
  ).filter(isStale);
  if (staleKeys.length === 0) return;

  let next: string | null = null;
  const surgical = dropStalePatchKeys(text, keepKey ?? "");
  if (surgical !== null) {
    try {
      // Only trust the surgical edit if it parses AND actually dropped every stale key —
      // a multi-line entry survives the line filter and must fall back to the JSON rewrite.
      const check = JSON.parse(surgical);
      if (!Object.keys(check.patchedDependencies ?? {}).some(isStale)) {
        next = surgical;
      }
    } catch {
      // never ship a broken package.json
    }
  }
  if (next === null) {
    const parsed = JSON.parse(text);
    for (const k of staleKeys) delete parsed.patchedDependencies[k];
    next = JSON.stringify(parsed, null, 2) + "\n";
    console.warn(
      "patch-router-core: package.json wasn't entry-per-line; rewrote it via JSON (formatting may shift)",
    );
  }
  for (const k of staleKeys) {
    console.log(`patch-router-core: removed stale patchedDependencies key ${k}`);
  }
  await writeFile(rootPkgJsonPath, next);

  // Drop patch files no longer referenced by any patchedDependencies value — except the live
  // version's file, which `bun patch --commit` regenerates next when the key is still missing.
  const referenced = new Set(
    Object.values(JSON.parse(next).patchedDependencies ?? {}).map((v) =>
      basename(String(v)),
    ),
  );
  const keepFile = keepKey ? keepKey.replace("/", "%2F") + ".patch" : null;
  if (!existsSync(patchesDir)) return;
  for (const f of await readdir(patchesDir)) {
    if (
      f.startsWith(PATCH_FILE_PREFIX) &&
      f !== keepFile &&
      !referenced.has(f)
    ) {
      console.log(`patch-router-core: removed stale patch file patches/${f}`);
      await rm(join(patchesDir, f));
    }
  }
}

// --- 1. what is installed -----------------------------------------------------
if (!existsSync(join(pkgDir, "package.json"))) {
  fail("resolve", `${pkgDir} is missing — run \`bun install\` first.`);
}
const installed = JSON.parse(
  await readFile(join(pkgDir, "package.json"), "utf8"),
).version;
if (typeof installed !== "string" || !installed) {
  fail("resolve", `could not read a version from ${pkgDir}/package.json`);
}
const liveKey = `${PKG}@${installed}`;
console.log(`patch-router-core: installed ${liveKey}`);

// --- 2. make node_modules carry the lazy wrap ---------------------------------
const pkgJson = JSON.parse(await readFile(rootPkgJsonPath, "utf8"));
const declared = pkgJson.patchedDependencies?.[liveKey];
const patchOnDisk =
  typeof declared === "string" && existsSync(join(repoRoot, declared));

const src = await readFile(routerJsPath, "utf8");

if (!src.includes("replaceRouteChunk")) {
  // Upstream deleted the assignment (or the cycle). Nothing left to patch — drop the patch
  // metadata and leave test deletion to a human so the removal is an explicit, reviewable change.
  await removeStaleEntries(null);
  await run("bun install", [BUN, "install"]);
  console.log(
    `patch-router-core: ${PKG} no longer contains 'replaceRouteChunk' — the cycle is gone upstream.\n` +
      `Removed the patchedDependencies entry and patch file. Now delete the retired guard test\n` +
      `apps/syokan/server/routerCorePatch.test.ts and this script.`,
  );
  process.exit(0);
}

// `bun patch` prepares the package for editing: it re-materializes node_modules/<pkg> as a
// copy unlinked from Bun's global cache (node_modules files are hardlinks into the cache on
// Linux/Windows) and re-applies any registered patch — or restores the pristine copy when the
// live key isn't registered. Only needed when the package will be modified or committed.
const needsPrepare = !LAZY_RE.test(src) || !patchOnDisk;
if (needsPrepare) {
  await run("bun patch", [BUN, "patch", PKG]);
}

// Always decide on the post-prepare contents: preparation can add the wrap (registered patch
// re-applied) AND remove it (no patch registered → pristine restored), so `src` is stale either
// way once prepare ran.
const current = needsPrepare ? await readFile(routerJsPath, "utf8") : src;
if (!LAZY_RE.test(current)) {
  const matches = [...current.matchAll(EAGER_RE)];
  if (matches.length !== 1) {
    fail(
      "inspect",
      `${routerJsPath} has ${matches.length} eager '_replaceRouteChunk' assignments ` +
        `(expected exactly 1) and no known lazy wrap — upstream changed the shape. ` +
        `Inspect dist/esm/router.js, update the wrap in this script, and re-run.`,
    );
  }
  const indent = matches[0]?.[1];
  if (indent === undefined) {
    fail("inspect", "unreachable: matched eager line without an indent group");
  }
  const wrapped =
    `${indent}RouterCore.prototype._replaceRouteChunk = function(route, lazyFn) {\n` +
    `${indent}\treturn replaceRouteChunk(route, lazyFn);\n` +
    `${indent}};`;
  await writeFile(routerJsPath, current.replace(EAGER_RE, wrapped));
  console.log("patch-router-core: applied lazy wrap to dist/esm/router.js");
}

// --- 3. (re)generate the patch file + patchedDependencies key -------------------
if (!patchOnDisk) {
  await run("bun patch --commit", [BUN, "patch", "--commit", pkgDirRel]);
}

// --- 4. drop stale keys (old versions) + their patch files ----------------------
// After --commit, not before: a failed commit leaves package.json untouched rather than
// half-cleaned.
await removeStaleEntries(liveKey);

// --- 5. reconcile the lockfile + re-apply the patch, then verify -----------------
await run("bun install", [BUN, "install"]);

const verify = await readFile(routerJsPath, "utf8");
if (!LAZY_RE.test(verify)) {
  fail(
    "verify",
    `after install, ${routerJsPath} does not contain the lazy wrap — the patch did not apply.`,
  );
}
await run("guard test", [
  BUN,
  "test",
  "apps/syokan/server/routerCorePatch.test.ts",
]);
console.log(`patch-router-core: done — ${liveKey} is patched and verified`);
