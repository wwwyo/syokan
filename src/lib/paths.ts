import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

// 空文字の env は「未設定」として扱う。`??` だと "" を採用してしまい、相対パス
// (例 "syokan/data") として CWD 配下に書き込んでしまう。
function env(name: string): string | undefined {
  const v = process.env[name];
  return v ? v : undefined;
}

// XDG base directory spec は「これらの変数は絶対パスでなければならない。相対値は
// 無効として無視する」と定めている。相対値を受けると CWD 配下へ書き込む事故になるので
// default にフォールバックする。dev の相対 override は SYOKAN_* (env()) 側で受ける。
function absEnv(name: string): string | undefined {
  const v = env(name);
  return v && isAbsolute(v) ? v : undefined;
}

// 永続先は XDG base directory spec でライフサイクル別に分ける。全部を config に
// 集約すると snapshot / log が dotfiles 追跡対象 (~/.config) に混ざり、誤って git に
// 載せる事故を招く。keep(config/data)・machine-local(state) を分離する。
function configHome(): string {
  return absEnv("XDG_CONFIG_HOME") ?? join(homedir(), ".config");
}

function dataHome(): string {
  return absEnv("XDG_DATA_HOME") ?? join(homedir(), ".local", "share");
}

function stateHome(): string {
  return absEnv("XDG_STATE_HOME") ?? join(homedir(), ".local", "state");
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

// 旧レイアウト (全カテゴリを config 集約) での templates 位置。data home への移設で
// keep data が upgrade 時に消えるのを防ぐ 1 回限りの移行にのみ使う。明示 override 時は
// 呼び出し側が場所を管理しているので移行対象にせず null を返す。
export function legacyTemplatesDir(): string | null {
  if (env("SYOKAN_TEMPLATES_DIR")) return null;
  return join(configHome(), "syokan", "templates");
}

// 設定は singleton なので dir ではなく単一 file。config home に置く
// (この 1 ファイルだけが ~/.config/syokan 配下に残り、dotfiles で安全に版管理できる)。
export function settingFile(): string {
  return env("SYOKAN_SETTINGS_FILE") ?? join(configHome(), "syokan", "settings.json");
}
