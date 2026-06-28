import { homedir } from "node:os";
import { join } from "node:path";

// 空文字の env は「未設定」として扱う。`??` だと "" を採用してしまい、相対パス
// (例 "syokan/data") として CWD 配下に書き込んでしまう。
function env(name: string): string | undefined {
  const v = process.env[name];
  return v ? v : undefined;
}

// 永続先は XDG config 配下 (~/.config/syokan) に集約する。snapshot data は
// ephemeral だが、templates と runtime も含め置き場所を 1 系統に揃えることで
// lazy-spawn した server と CLI がどの起動経路からでも同じ場所を指す。
function configHome(): string {
  return env("XDG_CONFIG_HOME") ?? join(homedir(), ".config");
}

function syokanHome(): string {
  return join(configHome(), "syokan");
}

export function dataDir(): string {
  return env("SYOKAN_DATA_DIR") ?? join(syokanHome(), "data");
}

export function runtimeDir(): string {
  return env("SYOKAN_RUNTIME_DIR") ?? syokanHome();
}

export function templatesDir(): string {
  return env("SYOKAN_TEMPLATES_DIR") ?? join(syokanHome(), "templates");
}
