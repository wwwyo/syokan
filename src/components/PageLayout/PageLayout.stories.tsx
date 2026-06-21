import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "@/catalogs/Card";
import { Heading } from "@/catalogs/Heading";
import { MarkdownDoc } from "@/catalogs/MarkdownDoc";
import { Stack } from "@/catalogs/Stack";
import { Text } from "@/catalogs/Text";
import { PageLayout } from ".";

const meta = {
  title: "Components/PageLayout",
  component: PageLayout,
  tags: ["autodocs"],
  // PageLayout は本文カラム (max-w + 余白) を組む。canvas いっぱいに見せて確認する
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PageLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

// root は常に PageLayout でラップ。中身は single root (Stack) で束ね、
// 記事カードは Card + Heading + Text の合成で表現する (ArticleCard は廃止)。
export const Dashboard: Story = {
  render: () => (
    <PageLayout>
      <Stack>
        <Heading text="今日のRSS" level={2} />
        <Stack>
          <Card>
            <Heading
              text="Bun 1.3 がリリースされました"
              level={3}
              href="https://bun.sh/blog/bun-v1.3"
            />
            <Text body="HTML import の安定化と dev server の改善。" muted clamp />
          </Card>
          <Card>
            <Heading
              text="Tailwind CSS v4 の新しいエンジン"
              level={3}
              href="https://tailwindcss.com/blog/tailwindcss-v4"
            />
          </Card>
        </Stack>
        <Heading text="議事録" level={2} />
        <MarkdownDoc
          body={"## 決定事項\n\n- catalog を合成可能なプリミティブに再構成\n"}
        />
      </Stack>
    </PageLayout>
  ),
};
