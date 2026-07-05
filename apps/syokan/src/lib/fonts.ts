// SSOT for display fonts. Adding a font is just one entry here (no need to touch
// styles.css / index.html). value is the identifier saved to setting.font.
//
// Each preset carries its own sans/mono CSS stack, and those with google
// dynamically inject the Google Fonts <link> at runtime. The attribute-selector
// approach (styles.css's data-font blocks) is dropped in favor of writing the CSS
// variables --app-font-{sans,mono} directly.
//
// No i18n dependency: this module is also imported from the server (validation), so
// pulling in client-only i18n would get it evaluated in the server process too. The
// label can stay fixed as "System" regardless of language.

export type FontPreset = {
  value: string;
  label: string;
  // The full stack fed into --app-font-sans / --app-font-mono on switch.
  sans: string;
  mono: string;
  // The part after `?` in Google Fonts css2 (family=...&display=swap). local/system have none.
  googleQuery?: string;
};

// Latin-first, with Japanese glyphs falling back to OS fonts (system-ui family).
// Latin Google fonts lack Japanese glyphs, so this JP fallback is needed.
function sansStack(primary?: string): string {
  const head = primary ? `"${primary}", ` : "";
  return `${head}ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif`;
}

function monoStack(primary?: string): string {
  const head = primary ? `"${primary}", ` : "";
  return `${head}ui-monospace, SFMono-Regular, Menlo, Consolas, "Hiragino Sans", "Noto Sans JP", monospace`;
}

// Most fonts have 400/700, so pin weight to 400;700 to avoid css2's
// 400 (= invalid weight) error. This also works for variable fonts.
function google(family: string): string {
  return `family=${family.replaceAll(" ", "+")}:wght@400;700`;
}

// The default (= system). Also used as getFontPreset's final fallback, so kept named.
const SYSTEM_PRESET: FontPreset = {
  value: "system",
  label: "System",
  sans: sansStack(),
  mono: monoStack(),
};

// Unify both sans/mono on Moralerspace (monospace). Since both are the same stack, hold it in one place.
function moralerspacePreset(): FontPreset {
  const stack = `"Moralerspace Argon", "Source Han Code JP", ${monoStack()}`;
  return { value: "moralerspace", label: "Moralerspace", sans: stack, mono: stack };
}

// system / moralerspace are special entries not sourced via Google. The rest are Google Fonts.
export const FONT_PRESETS: readonly FontPreset[] = [
  SYSTEM_PRESET,
  moralerspacePreset(),
  // Latin sans
  { value: "inter", label: "Inter", sans: sansStack("Inter"), mono: monoStack(), googleQuery: google("Inter") },
  { value: "roboto", label: "Roboto", sans: sansStack("Roboto"), mono: monoStack(), googleQuery: google("Roboto") },
  { value: "open-sans", label: "Open Sans", sans: sansStack("Open Sans"), mono: monoStack(), googleQuery: google("Open Sans") },
  { value: "montserrat", label: "Montserrat", sans: sansStack("Montserrat"), mono: monoStack(), googleQuery: google("Montserrat") },
  { value: "poppins", label: "Poppins", sans: sansStack("Poppins"), mono: monoStack(), googleQuery: google("Poppins") },
  { value: "work-sans", label: "Work Sans", sans: sansStack("Work Sans"), mono: monoStack(), googleQuery: google("Work Sans") },
  { value: "nunito", label: "Nunito", sans: sansStack("Nunito"), mono: monoStack(), googleQuery: google("Nunito") },
  // Monospace (apply monospace to sans too)
  {
    value: "geist",
    label: "Geist",
    sans: `"Geist", ${sansStack()}`,
    mono: `"Geist Mono", ${monoStack()}`,
    googleQuery: `${google("Geist")}&${google("Geist Mono")}`,
  },
  { value: "jetbrains-mono", label: "JetBrains Mono", sans: monoStack("JetBrains Mono"), mono: monoStack("JetBrains Mono"), googleQuery: google("JetBrains Mono") },
  { value: "roboto-mono", label: "Roboto Mono", sans: monoStack("Roboto Mono"), mono: monoStack("Roboto Mono"), googleQuery: google("Roboto Mono") },
  // Japanese
  { value: "noto-sans-jp", label: "Noto Sans JP", sans: sansStack("Noto Sans JP"), mono: monoStack(), googleQuery: google("Noto Sans JP") },
  { value: "noto-serif-jp", label: "Noto Serif JP", sans: `"Noto Serif JP", ui-serif, "Hiragino Mincho ProN", "Yu Mincho", serif`, mono: monoStack(), googleQuery: google("Noto Serif JP") },
  { value: "zen-kaku-gothic", label: "Zen Kaku Gothic New", sans: sansStack("Zen Kaku Gothic New"), mono: monoStack(), googleQuery: google("Zen Kaku Gothic New") },
  { value: "m-plus-rounded", label: "M PLUS Rounded 1c", sans: sansStack("M PLUS Rounded 1c"), mono: monoStack(), googleQuery: google("M PLUS Rounded 1c") },
  { value: "biz-udpgothic", label: "BIZ UDPGothic", sans: sansStack("BIZ UDPGothic"), mono: monoStack(), googleQuery: google("BIZ UDPGothic") },
];

export const DEFAULT_FONT = "system";

const PRESET_BY_VALUE: ReadonlyMap<string, FontPreset> = new Map(
  FONT_PRESETS.map((p) => [p.value, p]),
);

// Unknown values (old saved values / hand-written) fall to the default (system).
export function getFontPreset(value: string): FontPreset {
  return PRESET_BY_VALUE.get(value) ?? SYSTEM_PRESET;
}

export function isFontValue(value: unknown): value is string {
  return typeof value === "string" && PRESET_BY_VALUE.has(value);
}

// The full Google Fonts stylesheet URL. Only for presets that have googleQuery.
export function googleFontHref(preset: FontPreset): string | undefined {
  if (!preset.googleQuery) return undefined;
  return `https://fonts.googleapis.com/css2?${preset.googleQuery}&display=swap`;
}
