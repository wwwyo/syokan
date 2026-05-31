import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArticleCard } from ".";

const meta = {
  title: "Catalog/ArticleCard",
  component: ArticleCard,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    title: "Bun 1.3 がリリースされました",
    url: "https://bun.sh/blog/bun-v1.3",
    summary:
      "HTML import の安定化、組み込み dev server、Tailwind plugin の改善などが含まれます。",
    publishedAt: "2026-05-21T01:23:45Z",
  },
} satisfies Meta<typeof ArticleCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutSummary: Story = {
  args: { summary: undefined },
};

export const WithoutDate: Story = {
  args: { publishedAt: undefined },
};

export const TitleAndUrlOnly: Story = {
  args: { summary: undefined, publishedAt: undefined },
};

export const LongSummary: Story = {
  args: {
    title: "line-clamp の確認",
    summary:
      "要約が長い場合は line-clamp-3 で3行に省略される。" +
      "これはその挙動を確認するためのダミーテキストを繰り返したものである。".repeat(5),
  },
};
