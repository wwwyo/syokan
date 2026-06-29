import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSettingStore, type SettingStore } from "./setting";

describe("createSettingStore", () => {
  let dir: string;
  let file: string;
  let store: SettingStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "syokan-setting-"));
    file = join(dir, "settings.json");
    store = createSettingStore(file);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("get returns defaults when file is absent", async () => {
    expect(await store.get()).toEqual({ theme: "system", font: "system" });
  });

  test("update persists a partial patch and merges with defaults", async () => {
    const next = await store.update({ theme: "dark" });
    expect(next).toEqual({ theme: "dark", font: "system" });
    // re-read from disk via a fresh store (server restart simulation)
    expect(await createSettingStore(file).get()).toEqual({
      theme: "dark",
      font: "system",
    });
  });

  test("update only overwrites supplied keys", async () => {
    await store.update({ theme: "dark" });
    const next = await store.update({ font: "geist" });
    expect(next).toEqual({ theme: "dark", font: "geist" });
  });

  test("get fills missing keys from defaults and drops unknown keys", async () => {
    await writeFile(file, JSON.stringify({ theme: "light", bogus: 1 }), "utf8");
    expect(await store.get()).toEqual({ theme: "light", font: "system" });
  });

  test("get falls back to defaults on corrupt json or invalid value", async () => {
    await writeFile(file, "{not json", "utf8");
    expect(await store.get()).toEqual({ theme: "system", font: "system" });
    await writeFile(file, JSON.stringify({ theme: "neon" }), "utf8");
    expect(await store.get()).toEqual({ theme: "system", font: "system" });
  });
});
