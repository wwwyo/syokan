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

// The setting is a single entity (singleton). Unlike a snapshot (ephemeral), it's meant to be kept,
// holding "human display preferences" like theme / font. It persists to a single JSON file (paths.settingFile()).
// Close file over a closure and return a store bundling get/update (no class).
export function createSettingStore(file: string): SettingStore {
  // update is read-modify-write. Serialize within one process to prevent a lost update from the
  // interleave of concurrent PUTs (e.g. a theme change and a font change from different tabs).
  let writeChain: Promise<unknown> = Promise.resolve();

  // Fill a missing / corrupt file with defaults and always return a complete Setting. Unknown keys are silently dropped.
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

  // Partial update. Overlay patch onto the current value, rewrite the whole thing, and return the finalized complete Setting.
  async function update(patch: SettingPatch): Promise<Setting> {
    const run = writeChain.then(async () => {
      const next: Setting = { ...(await get()), ...patch };
      await writeJsonAtomic(file, next);
      return next;
    });
    // Swallow on the chain side so one failure doesn't halt the rest (propagated to the caller via run).
    writeChain = run.catch(() => {});
    return run;
  }

  return { get, update };
}
