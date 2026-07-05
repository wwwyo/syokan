import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlainText } from ".";

const meta = {
  title: "Catalog/PlainText",
  component: PlainText,
  tags: ["autodocs"],
} satisfies Meta<typeof PlainText>;

export default meta;
type Story = StoryObj<typeof meta>;

// PlainText does not interpret markdown; it shows whitespace and newlines as-is, monospaced (Code lang=text)
export const Log: Story = {
  args: {
    body: `[12:00:01] INFO  server started on :5173
[12:00:02] WARN  cache miss for key=daily/2026-05-31
[12:00:03] ERROR failed to fetch https://example.com (timeout)
[12:00:04] INFO  retrying... (1/3)`,
  },
};

// the difference from MarkdownDoc: # and * come out as literal characters, not interpreted as markdown
export const MarkdownCharsStayLiteral: Story = {
  args: {
    body: "# this does not become a heading\n- nor does this become a bullet\n**not bold either**",
  },
};

export const Empty: Story = {
  args: { body: "" },
};
