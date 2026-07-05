import type { Meta, StoryObj } from "@storybook/react-vite";
import { Time } from ".";

const meta = {
  title: "Catalog/Time",
  component: Time,
  tags: ["autodocs"],
} satisfies Meta<typeof Time>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { datetime: "2026-05-21T03:04:00Z" } };
export const Muted: Story = {
  args: { datetime: "2026-05-21T03:04:00Z", muted: true },
};
