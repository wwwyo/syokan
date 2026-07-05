import type { Meta, StoryObj } from "@storybook/react-vite";
import { Heading } from "../Heading";
import { Text } from "../Text";
import { Card } from ".";

const meta = {
  title: "Catalog/Card",
  component: Card,
  tags: ["autodocs"],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

// Express the old ArticleCard equivalent by composing Card + Heading(href) + Text(muted).
export const ArticleLike: Story = {
  render: () => (
    <Card>
      <Heading
        text="Bun 1.3 has been released"
        level={3}
        href="https://bun.sh/blog/bun-v1.3"
      />
      <Text body="Stabilized HTML import and dev server improvements." muted />
    </Card>
  ),
};
