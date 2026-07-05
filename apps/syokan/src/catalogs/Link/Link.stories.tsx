import type { Meta, StoryObj } from "@storybook/react-vite";
import { Link } from ".";

const meta = {
  title: "Catalog/Link",
  component: Link,
  tags: ["autodocs"],
} satisfies Meta<typeof Link>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithLabel: Story = {
  args: { href: "https://example.com/", text: "To Example" },
};
export const HrefAsLabel: Story = { args: { href: "https://example.com/" } };
