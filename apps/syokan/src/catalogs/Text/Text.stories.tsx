import type { Meta, StoryObj } from "@storybook/react-vite";
import { Text } from ".";

const meta = {
  title: "Catalog/Text",
  component: Text,
  tags: ["autodocs"],
} satisfies Meta<typeof Text>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = { args: { body: "A regular short line of text." } };
export const Muted: Story = {
  args: { body: "Dimmed supplementary text.", muted: true },
};
export const Clamped: Story = {
  args: {
    body: "Placing a very long piece of text here gets clamped to 3 lines. ".repeat(8),
    clamp: true,
  },
};
