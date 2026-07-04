// 表示フォントの SSOT。ここに 1 エントリ足すだけでフォントを増やせる
// (styles.css / index.html を触らずに済む)。value は setting.font に保存する識別子。
//
// 各プリセットは sans/mono の CSS スタックを自前で持ち、google を持つものは
// 実行時に Google Fonts の <link> を動的注入する。属性セレクタ方式 (styles.css の
// data-font ブロック) はやめ、CSS 変数 --app-font-{sans,mono} を直接書き込む。
import { t } from "@/lib/i18n";

export type FontPreset = {
  value: string;
  label: string;
  // 切替時に --app-font-sans / --app-font-mono に流し込む完全なスタック。
  sans: string;
  mono: string;
  // Google Fonts css2 の `?` 以降 (family=...&display=swap)。local/system は持たない。
  googleQuery?: string;
};

// 欧文を主に、日本語グリフは OS フォント (system-ui 系) にフォールバックさせる。
// 欧文 Google フォントは日本語字形を持たないため、この JP フォールバックが要る。
function sansStack(primary?: string): string {
  const head = primary ? `"${primary}", ` : "";
  return `${head}ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif`;
}

function monoStack(primary?: string): string {
  const head = primary ? `"${primary}", ` : "";
  return `${head}ui-monospace, SFMono-Regular, Menlo, Consolas, "Hiragino Sans", "Noto Sans JP", monospace`;
}

// 多くのフォントが 400/700 を持つので、weight は 400;700 に固定して css2 の
// 400 (= invalid weight) エラーを避ける。可変フォントでもこの指定で動く。
function google(family: string): string {
  return `family=${family.replaceAll(" ", "+")}:wght@400;700`;
}

// 既定 (= system)。getFontPreset の最終フォールバックにも使うので名前付きで持つ。
const SYSTEM_PRESET: FontPreset = {
  value: "system",
  label: t.fontSelect.systemPreset,
  sans: sansStack(),
  mono: monoStack(),
};

// sans/mono とも Moralerspace (等幅) で統一する。両者が同一スタックなので 1 箇所で持つ。
function moralerspacePreset(): FontPreset {
  const stack = `"Moralerspace Argon", "Source Han Code JP", ${monoStack()}`;
  return { value: "moralerspace", label: "Moralerspace", sans: stack, mono: stack };
}

// system / moralerspace は Google 経由でない特別エントリ。残りは Google Fonts。
export const FONT_PRESETS: readonly FontPreset[] = [
  SYSTEM_PRESET,
  moralerspacePreset(),
  // 欧文 sans
  { value: "inter", label: "Inter", sans: sansStack("Inter"), mono: monoStack(), googleQuery: google("Inter") },
  { value: "roboto", label: "Roboto", sans: sansStack("Roboto"), mono: monoStack(), googleQuery: google("Roboto") },
  { value: "open-sans", label: "Open Sans", sans: sansStack("Open Sans"), mono: monoStack(), googleQuery: google("Open Sans") },
  { value: "montserrat", label: "Montserrat", sans: sansStack("Montserrat"), mono: monoStack(), googleQuery: google("Montserrat") },
  { value: "poppins", label: "Poppins", sans: sansStack("Poppins"), mono: monoStack(), googleQuery: google("Poppins") },
  { value: "work-sans", label: "Work Sans", sans: sansStack("Work Sans"), mono: monoStack(), googleQuery: google("Work Sans") },
  { value: "nunito", label: "Nunito", sans: sansStack("Nunito"), mono: monoStack(), googleQuery: google("Nunito") },
  // 等幅 (sans にも等幅を当てる)
  {
    value: "geist",
    label: "Geist",
    sans: `"Geist", ${sansStack()}`,
    mono: `"Geist Mono", ${monoStack()}`,
    googleQuery: `${google("Geist")}&${google("Geist Mono")}`,
  },
  { value: "jetbrains-mono", label: "JetBrains Mono", sans: monoStack("JetBrains Mono"), mono: monoStack("JetBrains Mono"), googleQuery: google("JetBrains Mono") },
  { value: "roboto-mono", label: "Roboto Mono", sans: monoStack("Roboto Mono"), mono: monoStack("Roboto Mono"), googleQuery: google("Roboto Mono") },
  // 日本語
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

// 未知 value (古い保存値 / 手書き) は default(system) に落とす。
export function getFontPreset(value: string): FontPreset {
  return PRESET_BY_VALUE.get(value) ?? SYSTEM_PRESET;
}

export function isFontValue(value: unknown): value is string {
  return typeof value === "string" && PRESET_BY_VALUE.has(value);
}

// Google Fonts の完全な stylesheet URL。googleQuery を持つプリセットのみ。
export function googleFontHref(preset: FontPreset): string | undefined {
  if (!preset.googleQuery) return undefined;
  return `https://fonts.googleapis.com/css2?${preset.googleQuery}&display=swap`;
}
