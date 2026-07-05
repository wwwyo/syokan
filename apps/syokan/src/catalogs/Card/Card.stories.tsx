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

// 旧 ArticleCard 相当を Card + Heading(href) + Text(muted) の合成で表現する。
export const ArticleLike: Story = {
  render: () => (
    <Card>
      <Heading
        text="Bun 1.3 がリリースされました"
        level={3}
        href="https://bun.sh/blog/bun-v1.3"
      />
      <Text body="HTML import の安定化と dev server の改善。" muted />
    </Card>
  ),
};
