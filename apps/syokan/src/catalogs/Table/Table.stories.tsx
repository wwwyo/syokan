import type { Meta, StoryObj } from "@storybook/react-vite";
import { Table } from ".";

const meta = {
  title: "Catalog/Table",
  component: Table,
  tags: ["autodocs"],
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    columns: ["PR", "State", "Updated"],
    rows: [
      [
        { type: "Link", props: { href: "https://github.com/wwwyo/syokan/pull/1", text: "#1 catalog" } },
        { type: "Badge", props: { text: "merged", variant: "secondary" } },
        { type: "Time", props: { datetime: "2026-07-01T09:30:00Z" } },
      ],
      [
        { type: "Link", props: { href: "https://github.com/wwwyo/syokan/pull/2", text: "#2 share" } },
        { type: "Badge", props: { text: "open" } },
        { type: "Time", props: { datetime: "2026-07-06T02:10:00Z" } },
      ],
    ],
  },
};

export const PlainStrings: Story = {
  args: {
    columns: ["Feed", "Unread"],
    rows: [
      ["Hacker News", "12"],
      ["Lobsters", "3"],
    ],
  },
};

export const MixedInlineRun: Story = {
  args: {
    columns: ["Finding", "Judgement"],
    rows: [
      [
        [
          { type: "Text", props: { body: "share token in logs" } },
          { type: "Badge", props: { text: "High", variant: "destructive" } },
        ],
        [
          { type: "Text", props: { body: "confirmed at" } },
          { type: "Time", props: { datetime: "2026-07-05T12:00:00Z", muted: true } },
        ],
      ],
    ],
  },
};

export const LongCell: Story = {
  args: {
    columns: ["File", "Note"],
    rows: [
      [
        "apps/syokan/server/routes.ts",
        "A very long explanation that should wrap inside the cell rather than stretch the table: the handler revalidates the envelope, resolves idempotency, then persists to the ephemeral store before responding with the snapshot URL.",
      ],
    ],
  },
};

export const RaggedAndEmptyRows: Story = {
  args: {
    columns: ["A", "B", "C"],
    rows: [["only-a"], [], ["a", "b", "c"]],
  },
};

export const ZeroRows: Story = {
  args: { columns: ["Empty"], rows: [] },
};
