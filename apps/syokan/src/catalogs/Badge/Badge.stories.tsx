import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from ".";

const meta = {
  title: "Catalog/Badge",
  component: Badge,
  tags: ["autodocs"],
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { text: "open" } };
export const Secondary: Story = { args: { text: "draft", variant: "secondary" } };
export const Destructive: Story = {
  args: { text: "closed", variant: "destructive" },
};
export const Outline: Story = {
  args: { text: "needs review", variant: "outline" },
};
