import { afterEach, describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { dataDir, runtimeDir, templatesDir } from "./paths";

const KEYS = [
  "XDG_CONFIG_HOME",
  "SYOKAN_DATA_DIR",
  "SYOKAN_TEMPLATES_DIR",
  "SYOKAN_RUNTIME_DIR",
] as const;
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("paths", () => {
  test("empty-string env is treated as unset (no relative/CWD writes)", () => {
    for (const k of KEYS) process.env[k] = "";
    const base = join(homedir(), ".config", "syokan");
    expect(dataDir()).toBe(join(base, "data"));
    expect(templatesDir()).toBe(join(base, "templates"));
    expect(runtimeDir()).toBe(base);
  });

  test("explicit env overrides win", () => {
    process.env.SYOKAN_DATA_DIR = "/var/tmp/x/data";
    expect(dataDir()).toBe("/var/tmp/x/data");
  });
});
