import type { Meta, StoryObj } from "@storybook/react-vite";
import { Code } from ".";

// Code は @pierre/diffs の File をラップした catalog component。
// ハイライトはマウント後に shadow DOM 内で適用される。未知 lang は "text" にフォールバックする。
// theme は documentElement の .dark を監視して切替わるので toolbar の light/dark で追従確認できる。
const meta = {
  title: "Catalog/Code",
  component: Code,
  tags: ["autodocs"],
} satisfies Meta<typeof Code>;

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
  args: { lang: "bash", code: "bun install\nbun run dev" },
};

export const Json: Story = {
  args: {
    lang: "json",
    code: `{ "type": "Heading", "props": { "text": "hi", "href": "https://x" } }`,
  },
};

export const WithFilename: Story = {
  args: {
    lang: "ts",
    filename: "src/lib/date.ts",
    code: `export function formatDateTime(iso: string): string {
  return new Date(iso).toISOString();
}`,
  },
};

// lang 未指定は素のテキスト表示 (markdown 解釈なし)
export const PlainTextLike: Story = {
  args: { code: "plain text without highlighting\n  indented line" },
};

// Shiki が知らない lang は落ちず "text" フォールバックで生テキストを出す
export const UnsupportedLang: Story = {
  args: {
    lang: "made-up-lang",
    code: "this is not a real language\n  keep indentation",
  },
};
