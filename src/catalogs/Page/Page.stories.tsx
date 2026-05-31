import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArticleCard } from "../ArticleCard";
import { ArticleList } from "../ArticleList";
import { MarkdownDoc } from "../MarkdownDoc";
import { Section } from "../Section";
import { Page } from ".";

const meta = {
  title: "Catalog/Page",
  component: Page,
  tags: ["autodocs"],
  // Page 自身が min-h-screen / max-w を持つので canvas いっぱいに見せる
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Page>;

export default meta;
type Story = StoryObj<typeof meta>;

// Page は他 catalog component を children に束ねる top-level container。
// 実際の使われ方 (Section で章立てし、ArticleList / MarkdownDoc を流し込む) を再現する。
export const Dashboard: Story = {
  args: { title: "2026-05-31 のダッシュボード" },
  render: (args) => (
    <Page {...args}>
      <Section heading="今日のRSS">
        <ArticleList>
          <ArticleCard
            title="Bun 1.3 がリリースされました"
            url="https://bun.sh/blog/bun-v1.3"
            summary="HTML import の安定化と dev server の改善。"
            publishedAt="2026-05-21T01:23:45Z"
          />
          <ArticleCard
            title="Tailwind CSS v4 の新しいエンジン"
            url="https://tailwindcss.com/blog/tailwindcss-v4"
            publishedAt="2026-05-18T09:00:00Z"
          />
        </ArticleList>
      </Section>
      <Section heading="議事録">
        <MarkdownDoc body={"## 決定事項\n\n- Storybook を導入する\n- catalog を story 化する\n"} />
      </Section>
    </Page>
  ),
};

export const Untitled: Story = {
  args: { title: undefined },
  render: (args) => (
    <Page {...args}>
      <Section heading="title 無しの Page">
        <p className="text-sm text-muted-foreground">
          title を渡さない場合は見出し帯を出さず本文だけになる。
        </p>
      </Section>
    </Page>
  ),
};
