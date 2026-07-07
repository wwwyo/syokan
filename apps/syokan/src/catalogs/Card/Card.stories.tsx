import type { Meta, StoryObj } from "@storybook/react-vite";
import { Heading } from "../Heading";
import { Stack } from "../Stack";
import { Text } from "../Text";
import { Card } from ".";

const meta = {
  title: "Catalog/Card",
  component: Card,
  tags: ["autodocs"],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

// Express the old ArticleCard equivalent: title in the header, body composed below.
export const ArticleLike: Story = {
  args: { title: "Bun 1.3 has been released" },
  render: (args) => (
    <Card {...args}>
      <Stack>
        <Text body="Stabilized HTML import and dev server improvements." muted />
        <Heading text="Read more" level={3} href="https://bun.sh/blog/bun-v1.3" />
      </Stack>
    </Card>
  ),
};

export const TitleOnly: Story = {
  args: { title: "Just a heading" },
};

export const NoTitle: Story = {
  render: () => (
    <Card>
      <Text body="A plain container with no header slot." />
    </Card>
  ),
};
