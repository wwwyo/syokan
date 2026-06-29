import { z } from "zod";

// theme/font の取りうる値はここを SSOT にする。client (lib/{theme,font}.ts) と
// server (settings store / route) が同じ enum を引き、drift を防ぐ。
export const THEME_VALUES = ["system", "light", "dark"] as const;
export const FONT_VALUES = ["current", "geist", "system"] as const;

export const settingsSchema = z
  .object({
    theme: z.enum(THEME_VALUES),
    font: z.enum(FONT_VALUES),
  })
  .strict();

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = { theme: "system", font: "current" };

// PUT は部分更新を許す。strict なので未知キー (typo) は弾く。空 {} は no-op として通す。
export const settingsPatchSchema = settingsSchema.partial().strict();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

// 永続 file の読み出し用。手置き / 旧 version で欠損・未知キーが混じりうるので、
// strict にせず既知キーだけ拾う (欠損は呼び出し側が DEFAULT_SETTINGS で補う)。
export const storedSettingsSchema = settingsSchema.partial();
