import { withThemeByClassName } from "@storybook/addon-themes";
import type { Preview } from "@storybook/react-vite";
import "../src/styles.css";

const preview: Preview = {
  parameters: {
    // 各 story 自身が bg-background の枠を持つので canvas 側の余白は付けない
    layout: "fullscreen",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    // theme 追従の背景枠。styles.css の CSS 変数 (.dark) をそのまま反映させる
    (Story) => (
      <div className="min-h-screen bg-background p-6 text-foreground">
        <Story />
      </div>
    ),
    // toolbar から light/dark を切替。.dark class を <html> に付与する
    withThemeByClassName({
      themes: { light: "", dark: "dark" },
      defaultTheme: "light",
      parentSelector: "html",
    }),
  ],
};

export default preview;
