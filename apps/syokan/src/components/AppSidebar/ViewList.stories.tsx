import type { Meta, StoryObj } from "@storybook/react-vite";
import { ViewList } from "./ViewList";

const meta = {
  title: "Components/AppSidebar/ViewList",
  component: ViewList,
  tags: ["autodocs"],
  // Verify the appearance inside a frame that mimics the actual sidebar panel (w-64 + border)
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
  { id: "a", title: "Today's RSS", createdAt: "2026-06-16T00:22:00Z" },
  {
    id: "b",
    title: "PR review: view-layer",
    createdAt: "2026-06-16T00:10:00Z",
  },
  {
    id: "c",
    title: "Daily Feed — an example of a long title truncated to a single line",
    createdAt: "2026-06-14T23:49:00Z",
  },
  { id: "d", createdAt: "2026-06-07T14:20:00Z" },
];

export const Default: Story = {
  args: { items, currentId: null },
};

// Show the snapshot currently on display as active
export const WithActiveItem: Story = {
  args: { items, currentId: "b" },
};

export const Empty: Story = {
  args: { items: [], currentId: null },
};
