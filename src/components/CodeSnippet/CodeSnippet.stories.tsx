import type { Meta, StoryObj } from "@storybook/react-vite";
import { CodeSnippet } from ".";

const meta = {
  title: "Components/CodeSnippet",
  component: CodeSnippet,
  tags: ["autodocs"],
} satisfies Meta<typeof CodeSnippet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Shell: Story = {
  args: { code: "bun install\nbun run dev" },
};

export const Multiline: Story = {
  args: {
    code: `curl -X POST http://localhost:5173/api/snapshots \\
  -H "content-type: application/json" \\
  -d '{ "root": { "type": "Heading", "props": { "text": "hi" } } }'`,
  },
};
