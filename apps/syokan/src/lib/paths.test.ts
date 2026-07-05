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

const KEYS = ["XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("paths", () => {
  test("unset XDG env falls back to spec defaults", () => {
    for (const k of KEYS) delete process.env[k];
    const home = homedir();
    expect(dataDir()).toBe(join(home, ".local", "state", "syokan"));
    expect(templatesDir()).toBe(join(home, ".local", "share", "syokan", "templates"));
    expect(runtimeDir()).toBe(join(home, ".local", "state", "syokan"));
    expect(settingFile()).toBe(join(home, ".config", "syokan", "settings.json"));
  });

  test("each category resolves under its own XDG base", () => {
    process.env.XDG_CONFIG_HOME = "/x/config";
    process.env.XDG_DATA_HOME = "/x/data";
    process.env.XDG_STATE_HOME = "/x/state";
    expect(settingFile()).toBe("/x/config/syokan/settings.json");
    expect(templatesDir()).toBe("/x/data/syokan/templates");
    expect(dataDir()).toBe("/x/state/syokan");
    expect(runtimeDir()).toBe("/x/state/syokan");
    expect(legacyTemplatesDir()).toBe("/x/config/syokan/templates");
  });

  test("empty-string or relative XDG env is ignored (spec: must be absolute)", () => {
    for (const k of KEYS) delete process.env[k];
    process.env.XDG_STATE_HOME = "";
    process.env.XDG_CONFIG_HOME = "state";
    const home = homedir();
    expect(dataDir()).toBe(join(home, ".local", "state", "syokan"));
    expect(settingFile()).toBe(join(home, ".config", "syokan", "settings.json"));
  });
});
