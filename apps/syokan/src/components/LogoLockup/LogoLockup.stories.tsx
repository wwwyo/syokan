import type { Meta, StoryObj } from "@storybook/react-vite";
import { LogoLockup } from ".";

const meta = {
  title: "Components/LogoLockup",
  component: LogoLockup,
  tags: ["autodocs"],
  args: { className: "text-4xl text-foreground" },
} satisfies Meta<typeof LogoLockup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// The lockup is sized purely by font-size, so it scales as one unit.
export const Scales: Story = {
  render: (args) => (
    <div className="flex flex-col gap-4 text-foreground">
      <LogoLockup {...args} className="text-xl" />
      <LogoLockup {...args} className="text-3xl" />
      <LogoLockup {...args} className="text-5xl" />
    </div>
  ),
};
