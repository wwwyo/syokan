import type { Meta, StoryObj } from "@storybook/react-vite";
import { ViewList } from "./ViewList";

const meta = {
  title: "Components/AppSidebar/ViewList",
  component: ViewList,
  tags: ["autodocs"],
  // 実際の sidebar panel (w-64 + border) を模した枠で見え方を確認する
  decorators: [
    (Story) => (
      <div className="w-64 border-r border-border bg-background p-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ViewList>;

export default meta;
type Story = StoryObj<typeof meta>;

const items = [
  { id: "a", title: "今日のRSS", createdAt: "2026-06-16T00:22:00Z" },
  {
    id: "b",
    title: "PR review: view-layer",
    createdAt: "2026-06-16T00:10:00Z",
    source: { label: "gh" },
  },
  {
    id: "c",
    title: "Daily Feed — 長いタイトルは 1 行で省略される例",
    createdAt: "2026-06-14T23:49:00Z",
    source: { label: "rss-daily" },
  },
  { id: "d", createdAt: "2026-06-07T14:20:00Z" },
];

export const Default: Story = {
  args: { items, currentId: null },
};

// 現在表示中の snapshot を active 表示する
export const WithActiveItem: Story = {
  args: { items, currentId: "b" },
};

export const Empty: Story = {
  args: { items: [], currentId: null },
};
