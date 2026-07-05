import { readFile } from "node:fs/promises";
import { writeJsonAtomic } from "@/lib/fsAtomic";
import {
  DEFAULT_SETTING,
  type Setting,
  type SettingPatch,
  storedSettingSchema,
} from "@/schema";

export type SettingStore = {
  get: () => Promise<Setting>;
  update: (patch: SettingPatch) => Promise<Setting>;
};

// 設定は単一 entity (singleton)。snapshot (ephemeral) と違い残す前提で、テーマ /
// フォントなど「人間の表示の好み」を保持する。永続先は単一 JSON file (paths.settingFile())。
// file を closure に閉じ、get/update を束ねた store を返す (class 不使用)。
export function createSettingStore(file: string): SettingStore {
  // update は read-modify-write。並行 PUT (例: 別タブの theme 変更と font 変更) の
  // interleave による lost update を防ぐため、1 プロセス内で直列化する。
  let writeChain: Promise<unknown> = Promise.resolve();

  // 欠損 / 壊れた file は default で補い、常に完全な Setting を返す。未知キーは黙って捨てる。
  async function get(): Promise<Setting> {
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return DEFAULT_SETTING;
      }
      throw err;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return DEFAULT_SETTING;
    }
    const parsed = storedSettingSchema.safeParse(raw);
    if (!parsed.success) return DEFAULT_SETTING;
    return { ...DEFAULT_SETTING, ...parsed.data };
  }

  // 部分更新。現在値に patch を被せて全体を書き直し、確定した完全な Setting を返す。
  async function update(patch: SettingPatch): Promise<Setting> {
    const run = writeChain.then(async () => {
      const next: Setting = { ...(await get()), ...patch };
      await writeJsonAtomic(file, next);
      return next;
    });
    // 1 つの失敗で以降を止めないよう chain 側は握る (呼び出し元へは run で伝播)。
    writeChain = run.catch(() => {});
    return run;
  }

  return { get, update };
}
