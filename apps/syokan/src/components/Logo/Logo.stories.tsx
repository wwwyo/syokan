import type { Meta, StoryObj } from "@storybook/react-vite";
import { Logo } from ".";

const meta = {
  title: "Components/Logo",
  component: Logo,
  tags: ["autodocs"],
  args: { className: "size-16 text-foreground" },
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// Verify currentColor following, and legibility when shrunk to favicon size.
export const Scales: Story = {
  render: (args) => (
    <div className="flex items-end gap-6 text-foreground">
      <Logo {...args} className="size-4" />
      <Logo {...args} className="size-6" />
      <Logo {...args} className="size-10" />
      <Logo {...args} className="size-16" />
    </div>
  ),
};

// One-stroke "summon" draw-on (empty/loading states). Remount the story to replay.
export const Animated: Story = {
  args: { animated: true, className: "size-24 text-foreground" },
};
