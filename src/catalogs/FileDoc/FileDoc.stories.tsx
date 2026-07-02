import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileDocBody } from ".";

// FileDoc 本体は server からファイルを取得する container。Storybook には server が無いため、
// 取得状態 (loading / 各エラー / markdown / text / code) を受ける presentational な
// FileDocBody を直接描画して視覚レビューする。
const meta = {
  title: "Catalog/FileDoc",
  component: FileDocBody,
  tags: ["autodocs"],
} satisfies Meta<typeof FileDocBody>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  args: { path: "/Users/me/notes.md", state: { kind: "loading" } },
};

export const Markdown: Story = {
  args: {
    path: "/Users/me/notes.md",
    state: {
      kind: "ok",
      content:
        "# 議事録\n\n- 決定事項 A\n- 決定事項 B\n\n```ts\nconst x = 1;\n```",
    },
  },
};

export const PlainLog: Story = {
  args: {
    path: "/var/log/app.log",
    state: {
      kind: "ok",
      content:
        "[12:00:01] INFO  started\n[12:00:02] WARN  cache miss\n[12:00:03] ERROR timeout",
    },
  },
};

export const Json: Story = {
  args: {
    path: "/Users/me/config.json",
    state: {
      kind: "ok",
      content: '{\n  "port": 5173,\n  "name": "syokan"\n}',
    },
  },
};

export const NotFound: Story = {
  args: {
    path: "/Users/me/deleted.md",
    state: { kind: "error", reason: "not_found" },
  },
};

export const TooLarge: Story = {
  args: {
    path: "/Users/me/huge.log",
    state: { kind: "error", reason: "too_large" },
  },
};

export const NotText: Story = {
  args: {
    path: "/Users/me/image.png",
    state: { kind: "error", reason: "not_text" },
  },
};
