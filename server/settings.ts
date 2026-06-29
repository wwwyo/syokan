import { readFile } from "node:fs/promises";
import { writeJsonAtomic } from "@/lib/fsAtomic";
import {
  DEFAULT_SETTINGS,
  type Settings,
  type SettingsPatch,
  storedSettingsSchema,
} from "@/schema";

// 設定は singleton。snapshot (ephemeral) と違い残す前提で、テーマ / フォントなど
// 「人間の表示の好み」を保持する。永続先は単一 JSON file (paths.settingsFile())。
export class SettingsStore {
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  // 欠損 / 壊れた file は default で補い、常に完全な Settings を返す。未知キーは黙って捨てる。
  async get(): Promise<Settings> {
    let text: string;
    try {
      text = await readFile(this.file, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return DEFAULT_SETTINGS;
      }
      throw err;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return DEFAULT_SETTINGS;
    }
    const parsed = storedSettingsSchema.safeParse(raw);
    if (!parsed.success) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...parsed.data };
  }

  // 部分更新。現在値に patch を被せて全体を書き直し、確定した完全な Settings を返す。
  async update(patch: SettingsPatch): Promise<Settings> {
    const next: Settings = { ...(await this.get()), ...patch };
    await writeJsonAtomic(this.file, next);
    return next;
  }
}
