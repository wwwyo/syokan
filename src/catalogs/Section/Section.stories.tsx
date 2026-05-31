import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArticleCard } from "../ArticleCard";
import { Section } from ".";

const meta = {
  title: "Catalog/Section",
  component: Section,
  tags: ["autodocs"],
  args: {
    heading: "今日のRSS",
  },
} satisfies Meta<typeof Section>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Section {...args}>
      <ArticleCard
        title="Section 配下の記事"
        url="https://example.com/in-section"
        summary="heading の下に children が並ぶ。"
      />
    </Section>
  ),
};

export const WithoutHeading: Story = {
  args: { heading: undefined },
  render: (args) => (
    <Section {...args}>
      <p className="text-sm text-muted-foreground">
        heading が無い場合は見出しを描画せず children のみ。
      </p>
    </Section>
  ),
};
