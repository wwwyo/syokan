import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveRepoHead, runProbe } from "./probe";

let repo: string;
let plainDir: string;

function sh(cwd: string, cmd: string[]): void {
  const result = Bun.spawnSync({ cmd, cwd });
  if (result.exitCode !== 0) {
    throw new Error(`${cmd.join(" ")} failed: ${result.stderr.toString()}`);
  }
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "syokan-probe-repo-"));
  sh(repo, ["git", "init", "-q", "-b", "main"]);
  sh(repo, ["git", "config", "user.email", "probe@test"]);
  sh(repo, ["git", "config", "user.name", "probe"]);
  writeFileSync(join(repo, "kept.txt"), "unchanged\n");
  writeFileSync(join(repo, "moved.txt"), "before\n");
  sh(repo, ["git", "add", "."]);
  sh(repo, ["git", "commit", "-qm", "base"]);
  sh(repo, ["git", "branch", "base"]);
  writeFileSync(join(repo, "moved.txt"), "after\n");
  sh(repo, ["git", "add", "."]);
  sh(repo, ["git", "commit", "-qm", "change moved.txt"]);

  plainDir = mkdtempSync(join(tmpdir(), "syokan-probe-search-"));
  writeFileSync(join(plainDir, "a.ts"), "console.log('x')\nconsole.log('y')\n");
  mkdirSync(join(plainDir, "nested"));
  writeFileSync(join(plainDir, "nested", "b.ts"), "console.log('z')\n");
  // binary files are skipped, not fatal
  writeFileSync(join(plainDir, "bin.dat"), Buffer.from([0, 1, 2]));
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(plainDir, { recursive: true, force: true });
});

describe("resolveRepoHead", () => {
  test("returns the HEAD commit of a repo", async () => {
    const result = await resolveRepoHead(repo);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  test("fails outside a git repository", async () => {
    const result = await resolveRepoHead(plainDir);
    expect(result.ok).toBe(false);
  });
});

describe("runProbe diff_clean", () => {
  test("passes for paths without diff from base, carrying the target ref", async () => {
    const result = await runProbe({
      kind: "diff_clean",
      repo,
      base: "base",
      paths: ["kept.txt"],
    });
    expect(result.status).toBe("pass");
    expect(result.ref?.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  test("fails for paths that changed since base", async () => {
    const result = await runProbe({
      kind: "diff_clean",
      repo,
      base: "base",
      paths: ["moved.txt"],
    });
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("diff from base");
  });

  test("errors on an unknown base ref instead of throwing", async () => {
    const result = await runProbe({
      kind: "diff_clean",
      repo,
      base: "no-such-ref",
      paths: ["kept.txt"],
    });
    expect(result.status).toBe("error");
  });
});

describe("runProbe search_count", () => {
  test("counts matches across a directory tree and compares with eq", async () => {
    const result = await runProbe({
      kind: "search_count",
      path: plainDir,
      pattern: "console.log",
      expected: 3,
    });
    expect(result.status).toBe("pass");
    expect(result.detail).toContain("3 matches");
    // no target ref → no stale judgement
    expect(result.ref).toBeUndefined();
  });

  test("max / min comparators", async () => {
    const max = await runProbe({
      kind: "search_count",
      path: plainDir,
      pattern: "console.log",
      expected: 2,
      op: "max",
    });
    expect(max.status).toBe("fail");
    const min = await runProbe({
      kind: "search_count",
      path: plainDir,
      pattern: "console.log",
      expected: 2,
      op: "min",
    });
    expect(min.status).toBe("pass");
  });

  test("single file target", async () => {
    const result = await runProbe({
      kind: "search_count",
      path: join(plainDir, "a.ts"),
      pattern: "console.log",
      expected: 2,
    });
    expect(result.status).toBe("pass");
  });

  test("errors on a missing path", async () => {
    const result = await runProbe({
      kind: "search_count",
      path: join(plainDir, "ghost"),
      pattern: "x",
      expected: 0,
    });
    expect(result.status).toBe("error");
  });

  test("binary files are skipped without downgrading a clean upper-bounded pass", async () => {
    // plainDir contains bin.dat (a binary file); a binary can't hold a source match,
    // so an eq/max pass over the tree stays green despite the skip
    const result = await runProbe({
      kind: "search_count",
      path: plainDir,
      pattern: "no-such-token",
      expected: 0,
      op: "max",
    });
    expect(result.status).toBe("pass");
    expect(result.detail).toContain("skipped");
  });

  test("an unreadable text file downgrades an eq/max pass but not a min pass", async () => {
    const dir = mkdtempSync(join(tmpdir(), "syokan-probe-oversized-"));
    try {
      writeFileSync(join(dir, "small.ts"), "clean\n");
      // over the 2MB read cap → readTextFile returns too_large → could hide a match
      writeFileSync(join(dir, "big.ts"), `${"x".repeat(2 * 1024 * 1024 + 1)}\nTODO\n`);
      const max = await runProbe({
        kind: "search_count",
        path: dir,
        pattern: "TODO",
        expected: 0,
        op: "max",
      });
      expect(max.status).toBe("error");
      const min = await runProbe({
        kind: "search_count",
        path: dir,
        pattern: "TODO",
        expected: 0,
        op: "min",
      });
      expect(min.status).toBe("pass");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("runProbe file_exists", () => {
  test("pass/fail follows existence and the expected flag", async () => {
    const there = join(plainDir, "a.ts");
    const gone = join(plainDir, "ghost.ts");
    expect((await runProbe({ kind: "file_exists", path: there })).status).toBe("pass");
    expect((await runProbe({ kind: "file_exists", path: gone })).status).toBe("fail");
    expect(
      (await runProbe({ kind: "file_exists", path: gone, expected: false }))
        .status,
    ).toBe("pass");
  });
});
