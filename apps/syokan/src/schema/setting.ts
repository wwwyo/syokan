import { z } from "zod";

// theme は固定 enum。font は識別子文字列で、取りうる値の SSOT は src/lib/fonts.ts
// (プリセット表)。schema をプリセットに依存させない (フォント追加で schema を触らない)
// ため、ここでは「識別子の形」だけを検証し、未知 value は適用側で default に落とす。
export const THEME_VALUES = ["system", "light", "dark"] as const;

const settingShape = {
  theme: z.enum(THEME_VALUES),
  font: z.string().regex(/^[a-z0-9-]{1,40}$/),
};

export const settingSchema = z.object(settingShape).strict();

export type Setting = z.infer<typeof settingSchema>;

export const DEFAULT_SETTING: Setting = { theme: "system", font: "system" };

// PUT は部分更新を許す。strict なので未知キー (typo) は弾く。空 {} は no-op として通す。
export const settingPatchSchema = z.object(settingShape).partial().strict();
export type SettingPatch = z.infer<typeof settingPatchSchema>;

// 永続 file の読み出し用。手置き / 旧 version で欠損・未知キーが混じりうるので、strict に
// せず未知キーは drop し既知キーだけ拾う (欠損は呼び出し側が DEFAULT_SETTING で補う)。
export const storedSettingSchema = z.object(settingShape).partial();
