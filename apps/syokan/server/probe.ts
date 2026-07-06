// Probe execution: predefined read-only checks only. The check schema (SSOT:
// src/catalogs/Probe) admits no arbitrary shell string — each kind maps to a fixed
// argv / fs walk here, so a snapshot can never make the server run attacker-chosen
// commands. Trust boundary is the localhost bind + user permissions (same as /api/files).

import { existsSync, type Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ProbeCheck, ProbeResult } from "../src/catalogs/Probe/check";
import { readTextFile } from "./fileSource";

const GIT_TIMEOUT_MS = 10_000;
// walk caps so search_count can't freeze the server on a huge tree
const SEARCH_MAX_FILES = 5_000;
const SKIPPED_DIRS = new Set([".git", "node_modules"]);

async function git(
  repo: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn({
    cmd: ["git", "-C", repo, ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => proc.kill(), GIT_TIMEOUT_MS);
  try {
    const [code, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    return { code, stdout: stdout.trim(), stderr: stderr.trim() };
  } finally {
    clearTimeout(timer);
  }
}

export type ResolveRefResult =
  | { ok: true; commit: string }
  | { ok: false; message: string };

/** Current HEAD commit of repo — the target ref diff_clean results go stale against. */
export async function resolveRepoHead(repo: string): Promise<ResolveRefResult> {
  try {
    const res = await git(repo, ["rev-parse", "HEAD"]);
    if (res.code !== 0) {
      return { ok: false, message: res.stderr || "not a git repository" };
    }
    return { ok: true, commit: res.stdout };
  } catch {
    return { ok: false, message: "git is not available" };
  }
}

function result(
  status: ProbeResult["status"],
  detail: string,
  ref?: { commit: string },
): ProbeResult {
  return {
    status,
    detail,
    ranAt: new Date().toISOString(),
    ...(ref !== undefined ? { ref } : {}),
  };
}

async function runDiffClean(
  check: Extract<ProbeCheck, { kind: "diff_clean" }>,
): Promise<ProbeResult> {
  const head = await resolveRepoHead(check.repo);
  if (!head.ok) return result("error", head.message);
  const res = await git(check.repo, [
    "diff",
    "--quiet",
    check.base,
    "--",
    ...check.paths,
  ]);
  const ref = { commit: head.commit };
  if (res.code === 0) {
    return result("pass", `no diff from ${check.base}`, ref);
  }
  if (res.code === 1) {
    const stat = await git(check.repo, [
      "diff",
      "--stat",
      check.base,
      "--",
      ...check.paths,
    ]);
    const summary = stat.stdout.split("\n").at(-1)?.trim() ?? "has diff";
    return result("fail", `diff from ${check.base}: ${summary}`, ref);
  }
  return result("error", res.stderr || `git exited with ${res.code}`);
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count++;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

async function collectFiles(root: string, limit: number): Promise<{ files: string[]; truncated: boolean }> {
  const files: string[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const dir = queue.shift();
    if (dir === undefined) break;
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    // deterministic order keeps repeated runs comparable
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) queue.push(path);
      } else if (entry.isFile()) {
        if (files.length >= limit) return { files, truncated: true };
        files.push(path);
      }
    }
  }
  return { files, truncated: false };
}

async function runSearchCount(
  check: Extract<ProbeCheck, { kind: "search_count" }>,
): Promise<ProbeResult> {
  const single = await readTextFile(check.path);
  let total = 0;
  let scanned = 0;
  let skipped = 0;
  let truncated = false;
  if (single.ok) {
    total = countOccurrences(single.content, check.pattern);
    scanned = 1;
  } else if (single.reason === "not_regular_file") {
    const collected = await collectFiles(check.path, SEARCH_MAX_FILES);
    truncated = collected.truncated;
    for (const file of collected.files) {
      const read = await readTextFile(file);
      if (!read.ok) {
        // binary / oversized / vanished files don't abort the whole search
        skipped++;
        continue;
      }
      scanned++;
      total += countOccurrences(read.content, check.pattern);
    }
  } else {
    return result("error", `cannot read ${check.path} (${single.reason})`);
  }
  const op = check.op ?? "eq";
  const pass =
    op === "eq"
      ? total === check.expected
      : op === "max"
        ? total <= check.expected
        : total >= check.expected;
  const opLabel = { eq: "==", max: "<=", min: ">=" }[op];
  const notes = [
    `${total} matches in ${scanned} files (expected ${opLabel} ${check.expected})`,
    ...(skipped > 0 ? [`${skipped} unreadable files skipped`] : []),
    ...(truncated ? [`scan capped at ${SEARCH_MAX_FILES} files`] : []),
  ];
  // a capped scan can undercount; never report a green result from partial coverage
  if (truncated && pass) return result("error", notes.join("; "));
  return result(pass ? "pass" : "fail", notes.join("; "));
}

function runFileExists(
  check: Extract<ProbeCheck, { kind: "file_exists" }>,
): ProbeResult {
  const exists = existsSync(check.path);
  const expected = check.expected ?? true;
  return result(
    exists === expected ? "pass" : "fail",
    exists ? "exists" : "does not exist",
  );
}

/** Run one predefined check. Never throws on operational failures — they become status "error". */
export async function runProbe(check: ProbeCheck): Promise<ProbeResult> {
  try {
    switch (check.kind) {
      case "diff_clean":
        return await runDiffClean(check);
      case "search_count":
        return await runSearchCount(check);
      case "file_exists":
        return runFileExists(check);
    }
  } catch (err) {
    return result("error", err instanceof Error ? err.message : String(err));
  }
}
