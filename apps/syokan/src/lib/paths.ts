import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

// XDG base directory spec は「これらの変数は絶対パスでなければならない。相対値は無効
// として無視する」と定めている。空文字や相対値を受けると CWD 配下へ書き込む事故になる
// ので、絶対パスのときだけ採用し、それ以外は spec 標準の default にフォールバックする。
function absEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && isAbsolute(v) ? v : undefined;
}

// 永続先は XDG base directory spec でライフサイクル別に分ける。全部を config に集約
// すると snapshot / log が dotfiles 追跡対象 (~/.config) に混ざり、誤って git に載せる
// 事故を招く。keep(config/data)・machine-local(state) を分離する。場所の上書きは
// SYOKAN_* の独自 env を増やさず XDG_*_HOME 一本に集約する (dev もこれで隔離する)。
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
  return join(stateHome(), "syokan");
}

// pid/port と log も machine-local な state。snapshot と同じ state dir に同居する。
export function runtimeDir(): string {
  return join(stateHome(), "syokan");
}

// templates は設定ではないが「残す」user data なので data home に置く。
export function templatesDir(): string {
  return join(dataHome(), "syokan", "templates");
}

// 旧レイアウト (全カテゴリを config 集約) での templates 位置。data home への移設で
// keep data が upgrade 時に消えるのを防ぐ 1 回限りの移行にのみ使う。
export function legacyTemplatesDir(): string {
  return join(configHome(), "syokan", "templates");
}

// 設定は singleton なので dir ではなく単一 file。config home に置く
// (この 1 ファイルだけが ~/.config/syokan 配下に残り、dotfiles で安全に版管理できる)。
export function settingFile(): string {
  return join(configHome(), "syokan", "settings.json");
}

// share API token は machine-local な secret。dotfiles 追跡対象 (config) に混ぜず
// state に置く (0600 での保存は書き込み側が担う)。
export function authFile(): string {
  return join(stateHome(), "syokan", "auth.json");
}
