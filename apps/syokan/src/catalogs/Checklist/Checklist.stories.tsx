import type { Meta, StoryObj } from "@storybook/react-vite";
import { Checklist } from ".";
import { Card } from "../Card";
import { Text } from "../Text";

const meta = {
  title: "Catalog/Checklist",
  component: Checklist,
  tags: ["autodocs"],
} satisfies Meta<typeof Checklist>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LabelsOnly: Story = {
  args: {
    items: [
      { label: "Write the failing test first" },
      { label: "Run typecheck", checked: true },
      { label: "Update the skill description" },
    ],
  },
};

export const WithInlineLabels: Story = {
  args: {
    items: [
      {
        label: [
          { type: "Badge", props: { text: "High", variant: "destructive" } },
          { type: "Text", props: { body: "share token logged in plain text" } },
        ],
      },
      {
        label: [
          { type: "Badge", props: { text: "Medium", variant: "secondary" } },
          { type: "Text", props: { body: "missing idempotency on retry" } },
        ],
        checked: true,
      },
    ],
  },
};

export const WithBodies: Story = {
  args: {
    items: [
      { label: "Verify the auth proxy strips tokens" },
      { label: "Confirm probe reruns are read-only", checked: true },
    ],
  },
  render: (args) => (
    <Checklist {...args}>
      <Card>
        <div className="p-4">
          <Text body="Evidence: server/share.ts holds the token; the FE only sees hc types. Check the log lines around publish." />
        </div>
      </Card>
      <Card>
        <div className="p-4">
          <Text body="Probes run predefined read-only kinds; arbitrary shell strings are rejected at the schema." />
        </div>
      </Card>
    </Checklist>
  ),
};

export const SingleItem: Story = {
  args: { items: [{ label: "Only one thing to confirm" }] },
};
