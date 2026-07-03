import { afterEach, describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  dataDir,
  legacyTemplatesDir,
  runtimeDir,
  settingFile,
  templatesDir,
} from "./paths";

const KEYS = [
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
  "SYOKAN_DATA_DIR",
  "SYOKAN_TEMPLATES_DIR",
  "SYOKAN_RUNTIME_DIR",
  "SYOKAN_SETTINGS_FILE",
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
    const home = homedir();
    expect(dataDir()).toBe(join(home, ".local", "state", "syokan"));
    expect(templatesDir()).toBe(join(home, ".local", "share", "syokan", "templates"));
    expect(runtimeDir()).toBe(join(home, ".local", "state", "syokan"));
    expect(settingFile()).toBe(join(home, ".config", "syokan", "settings.json"));
  });

  test("each category resolves under its own XDG base", () => {
    for (const k of KEYS) delete process.env[k];
    process.env.XDG_CONFIG_HOME = "/x/config";
    process.env.XDG_DATA_HOME = "/x/data";
    process.env.XDG_STATE_HOME = "/x/state";
    expect(settingFile()).toBe("/x/config/syokan/settings.json");
    expect(templatesDir()).toBe("/x/data/syokan/templates");
    expect(dataDir()).toBe("/x/state/syokan");
    expect(runtimeDir()).toBe("/x/state/syokan");
  });

  test("explicit SYOKAN_* env overrides win", () => {
    process.env.SYOKAN_DATA_DIR = "/var/tmp/x/data";
    expect(dataDir()).toBe("/var/tmp/x/data");
  });

  test("legacyTemplatesDir points at the old config layout for migration", () => {
    for (const k of KEYS) delete process.env[k];
    process.env.XDG_CONFIG_HOME = "/x/config";
    expect(legacyTemplatesDir()).toBe("/x/config/syokan/templates");
  });

  test("legacyTemplatesDir returns null when the location is explicitly overridden", () => {
    process.env.SYOKAN_TEMPLATES_DIR = "/custom/templates";
    expect(legacyTemplatesDir()).toBeNull();
  });
});
