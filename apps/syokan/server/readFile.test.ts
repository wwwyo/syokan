import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FILE_SIZE_LIMIT, readTextFile } from "./readFile";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "syokan-read-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

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
