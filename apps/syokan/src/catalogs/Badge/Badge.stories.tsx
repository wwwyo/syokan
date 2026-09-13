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
export const Success: Story = { args: { text: "verified", variant: "success" } };
export const Warning: Story = { args: { text: "medium", variant: "warning" } };
export const Info: Story = { args: { text: "note", variant: "info" } };

export const AllVariants: Story = {
  args: { text: "" },
  render: () => (
    <div className="flex flex-row flex-wrap items-center gap-2">
      <Badge text="default" />
      <Badge text="secondary" variant="secondary" />
      <Badge text="destructive" variant="destructive" />
      <Badge text="outline" variant="outline" />
      <Badge text="success" variant="success" />
      <Badge text="warning" variant="warning" />
      <Badge text="info" variant="info" />
    </div>
  ),
};
