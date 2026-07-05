import { z } from "zod";

// theme is a fixed enum. font is an identifier string whose value SSOT is src/lib/fonts.ts
// (the preset table). To keep the schema independent of the presets (no schema change when a
// font is added), only the identifier's shape is validated here; unknown values fall back to
// the default on the applying side.
export const THEME_VALUES = ["system", "light", "dark"] as const;

const settingShape = {
  theme: z.enum(THEME_VALUES),
  font: z.string().regex(/^[a-z0-9-]{1,40}$/),
};

export const settingSchema = z.object(settingShape).strict();

export type Setting = z.infer<typeof settingSchema>;

export const DEFAULT_SETTING: Setting = { theme: "system", font: "system" };

// PUT allows partial updates. strict, so unknown keys (typos) are rejected. An empty {} passes as a no-op.
export const settingPatchSchema = z.object(settingShape).partial().strict();
export type SettingPatch = z.infer<typeof settingPatchSchema>;

// For reading the persisted file. Hand-placed / older-version files may carry missing or unknown
// keys, so instead of strict, drop unknown keys and pick up only known ones (the caller fills
// missing ones from DEFAULT_SETTING).
export const storedSettingSchema = z.object(settingShape).partial();
