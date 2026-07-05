import { withThemeByClassName } from "@storybook/addon-themes";
import type { Preview } from "@storybook/react-vite";
import "../src/styles.css";

const preview: Preview = {
  parameters: {
    // padded で標準余白のみ付ける。背景/文字色は styles.css の body ルール
    // (bg-background / text-foreground) が preview iframe にも効くので枠は不要
    layout: "padded",
  },
  decorators: [
    // toolbar から light/dark を切替。.dark class を <html> に付与する
    withThemeByClassName({
      themes: { light: "", dark: "dark" },
      defaultTheme: "light",
      parentSelector: "html",
    }),
  ],
};

export default preview;
