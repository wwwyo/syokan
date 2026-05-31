import type { Meta, StoryObj } from "@storybook/react-vite";
import { MarkdownDoc } from ".";

const meta = {
  title: "Catalog/MarkdownDoc",
  component: MarkdownDoc,
  tags: ["autodocs"],
} satisfies Meta<typeof MarkdownDoc>;

export default meta;
type Story = StoryObj<typeof meta>;

const richBody = `# 見出し1

段落のテキスト。**強調** や \`inline code\`、[リンク](https://example.com)、~~取り消し線~~ を含む。

## 箇条書き

- りんご
- みかん
  - ネスト

## タスクリスト

- [x] Storybook を導入
- [ ] story を量産
- [ ] CI に組み込む

## テーブル

| 層 | 役割 |
|---|---|
| memory | 長期メモリ |
| view | 一時的な dashboard |

## 引用

> 抄して観るための場所。

## コードブロック

\`\`\`ts
export function add(a: number, b: number): number {
  return a + b;
}
\`\`\`
`;

export const Rich: Story = {
  args: { body: richBody },
};

export const HeadingsAndText: Story = {
  args: {
    body: "# タイトル\n\n## サブ見出し\n\n本文の段落。続けて2つ目の段落。\n",
  },
};

export const TableOnly: Story = {
  args: {
    body: "| key | value |\n|---|---|\n| a | 1 |\n| b | 2 |\n",
  },
};

export const Empty: Story = {
  args: { body: "" },
};
