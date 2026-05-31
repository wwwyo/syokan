import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArticleCard, type ArticleCardProps } from "../ArticleCard";
import { ArticleList } from ".";

const meta = {
  title: "Catalog/ArticleList",
  component: ArticleList,
  tags: ["autodocs"],
} satisfies Meta<typeof ArticleList>;

export default meta;
type Story = StoryObj<typeof meta>;

const articles: ArticleCardProps[] = [
  {
    title: "Bun 1.3 がリリースされました",
    url: "https://bun.sh/blog/bun-v1.3",
    summary: "HTML import の安定化と dev server の改善。",
    publishedAt: "2026-05-21T01:23:45Z",
  },
  {
    title: "Tailwind CSS v4 の新しいエンジン",
    url: "https://tailwindcss.com/blog/tailwindcss-v4",
    summary: "Oxide engine による高速化と CSS-first な設定。",
    publishedAt: "2026-05-18T09:00:00Z",
  },
  {
    title: "React 19 の use() フック",
    url: "https://react.dev/blog/2024/12/05/react-19",
  },
];

export const Default: Story = {
  render: () => (
    <ArticleList>
      {articles.map((article) => (
        <ArticleCard key={article.url} {...article} />
      ))}
    </ArticleList>
  ),
};

export const Single: Story = {
  render: () => (
    <ArticleList>
      <ArticleCard
        title="単一記事のみのリスト"
        url="https://example.com/single"
        summary="1件だけのときの間隔を確認する。"
        publishedAt="2026-05-30T12:00:00Z"
      />
    </ArticleList>
  ),
};

export const Empty: Story = {
  render: () => <ArticleList />,
};
