import type { Meta, StoryObj } from "@storybook/react-vite";
import { CodeBlock } from ".";

// CodeBlock は catalog 非登録の共有内部部品 (MarkdownDoc / PlainText が利用)。
// Shiki ハイライトはマウント後に非同期で適用されるため、初回は plain fallback が
// 一瞬見えることがある。
const meta = {
  title: "Components/CodeBlock",
  component: CodeBlock,
  tags: ["autodocs"],
} satisfies Meta<typeof CodeBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TypeScript: Story = {
  args: {
    lang: "tsx",
    code: `import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
}`,
  },
};

export const Bash: Story = {
  args: {
    lang: "bash",
    code: "bun install\nbun run dev",
  },
};

export const Json: Story = {
  args: {
    lang: "json",
    code: `{ "type": "Heading", "props": { "text": "hi", "href": "https://x" } }`,
  },
};

export const Diff: Story = {
  args: {
    lang: "diff",
    code: "- const a = 1;\n+ const a = 2;",
  },
};

// 未知 lang / lang 未指定は text 扱いでハイライトせず等幅表示
export const UnknownLang: Story = {
  args: {
    code: "plain text without highlighting\n  indented line",
  },
};

// filename を渡すとコード上部にファイル名ヘッダーを出す
export const WithFilename: Story = {
  args: {
    lang: "ts",
    filename: "src/lib/date.ts",
    code: `export function formatDateTime(iso: string): string {
  return new Date(iso).toISOString();
}`,
  },
};

// Shiki が知らない lang を指定した場合に落ちず素のテキストで出るか確認する
export const UnsupportedLang: Story = {
  args: {
    lang: "made-up-lang",
    code: "this is not a real language\n  keep indentation",
  },
};
