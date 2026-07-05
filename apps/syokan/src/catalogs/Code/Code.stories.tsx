import type { Meta, StoryObj } from "@storybook/react-vite";
import { Code } from ".";

// Code is a catalog component wrapping @pierre/diffs' File.
// Highlighting is applied inside the shadow DOM after mount. An unknown lang falls back to "text".
// The theme switches by watching documentElement's .dark, so the toolbar's light/dark toggle confirms it follows along.
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

// An unspecified lang renders as plain text (no markdown interpretation)
export const PlainTextLike: Story = {
  args: { code: "plain text without highlighting\n  indented line" },
};

// A lang Shiki doesn't know doesn't crash; it falls back to "text" and shows raw text
export const UnsupportedLang: Story = {
  args: {
    lang: "made-up-lang",
    code: "this is not a real language\n  keep indentation",
  },
};
