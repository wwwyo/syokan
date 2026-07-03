import { homedir } from "node:os";
import { join } from "node:path";

// 空文字の env は「未設定」として扱う。`??` だと "" を採用してしまい、相対パス
// (例 "syokan/data") として CWD 配下に書き込んでしまう。
function env(name: string): string | undefined {
  const v = process.env[name];
  return v ? v : undefined;
}

// 永続先は XDG base directory spec でライフサイクル別に分ける。全部を config に
// 集約すると snapshot / log が dotfiles 追跡対象 (~/.config) に混ざり、誤って git に
// 載せる事故を招く。keep(config/data)・machine-local(state) を分離する。
function configHome(): string {
  return env("XDG_CONFIG_HOME") ?? join(homedir(), ".config");
}

function dataHome(): string {
  return env("XDG_DATA_HOME") ?? join(homedir(), ".local", "share");
}

function stateHome(): string {
  return env("XDG_STATE_HOME") ?? join(homedir(), ".local", "state");
}

// snapshot は cache ではなく state に置く。cache の契約は「第三者が予告なく purge
// してよい」だが、syokan は snapshot を自動再生成せず (producer の再投稿が要る)、
// 再起動をまたいで残ってほしい。この「persist するが backup 不要」は state の領分。
export function dataDir(): string {
  return env("SYOKAN_DATA_DIR") ?? join(stateHome(), "syokan");
}

// pid/port と log も machine-local な state。snapshot と同じ state dir に同居する。
export function runtimeDir(): string {
  return env("SYOKAN_RUNTIME_DIR") ?? join(stateHome(), "syokan");
}

// templates は設定ではないが「残す」user data なので data home に置く。
export function templatesDir(): string {
  return env("SYOKAN_TEMPLATES_DIR") ?? join(dataHome(), "syokan", "templates");
}

// 設定は singleton なので dir ではなく単一 file。config home に置く
// (この 1 ファイルだけが ~/.config/syokan 配下に残り、dotfiles で安全に版管理できる)。
export function settingFile(): string {
  return env("SYOKAN_SETTINGS_FILE") ?? join(configHome(), "syokan", "settings.json");
}
