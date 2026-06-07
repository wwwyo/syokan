import type { Meta, StoryObj } from "@storybook/react-vite";
import { Text } from ".";

const meta = {
  title: "Catalog/Text",
  component: Text,
  tags: ["autodocs"],
} satisfies Meta<typeof Text>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = { args: { body: "通常の短文テキスト。" } };
export const Muted: Story = { args: { body: "淡色の補足テキスト。", muted: true } };
export const Clamped: Story = {
  args: {
    body: "とても長いテキストをここに置くと 3 行で省略される。".repeat(8),
    clamp: true,
  },
};
