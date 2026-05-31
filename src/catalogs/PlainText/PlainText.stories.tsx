import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlainText } from ".";

const meta = {
  title: "Catalog/PlainText",
  component: PlainText,
  tags: ["autodocs"],
} satisfies Meta<typeof PlainText>;

export default meta;
type Story = StoryObj<typeof meta>;

// PlainText は markdown 解釈せず空白・改行をそのまま等幅で見せる (CodeBlock lang=text)
export const Log: Story = {
  args: {
    body: `[12:00:01] INFO  server started on :5173
[12:00:02] WARN  cache miss for key=daily/2026-05-31
[12:00:03] ERROR failed to fetch https://example.com (timeout)
[12:00:04] INFO  retrying... (1/3)`,
  },
};

// # や * を markdown として解釈せず文字のまま出すのが MarkdownDoc との違い
export const MarkdownCharsStayLiteral: Story = {
  args: {
    body: "# これは見出しにならない\n- これも箇条書きにならない\n**bold にもならない**",
  },
};

export const Empty: Story = {
  args: { body: "" },
};
