import type { Meta, StoryObj } from "@storybook/react-vite";
import { Heading } from ".";

const meta = {
  title: "Catalog/Heading",
  component: Heading,
  tags: ["autodocs"],
} satisfies Meta<typeof Heading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Level1: Story = { args: { text: "Heading level 1", level: 1 } };
export const Level2: Story = { args: { text: "Heading level 2", level: 2 } };
export const Level3: Story = { args: { text: "Heading level 3", level: 3 } };
export const AsLink: Story = {
  args: { text: "Linked heading", level: 3, href: "https://example.com/" },
};
