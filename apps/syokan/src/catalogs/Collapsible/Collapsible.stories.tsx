import type { Meta, StoryObj } from "@storybook/react-vite";
import { Collapsible } from ".";
import { Text } from "../Text";

const meta = {
  title: "Catalog/Collapsible",
  component: Collapsible,
  tags: ["autodocs"],
} satisfies Meta<typeof Collapsible>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ClosedByDefault: Story = {
  args: { summary: "Evidence (3 hunks)" },
  render: (args) => (
    <Collapsible {...args}>
      <Text body="The folded detail: only readers who need it pay the attention cost." />
    </Collapsible>
  ),
};

export const OpenByDefault: Story = {
  args: { summary: "Currently relevant detail", defaultOpen: true },
  render: (args) => (
    <Collapsible {...args}>
      <Text body="Starts expanded; the reader can fold it away once done." />
    </Collapsible>
  ),
};

export const InlineSummary: Story = {
  args: {
    summary: [
      { type: "Badge", props: { text: "None", variant: "outline" } },
      { type: "Text", props: { body: "checked areas with no findings" } },
    ],
  },
  render: (args) => (
    <Collapsible {...args}>
      <Text body="Verified: authz on share endpoints, token logging, retry idempotency." muted />
    </Collapsible>
  ),
};

export const Nested: Story = {
  args: { summary: "Outer fold", defaultOpen: true },
  render: (args) => (
    <Collapsible {...args}>
      <Collapsible summary="Inner fold">
        <Text body="Anchor navigation opens every closed ancestor to reach this." />
      </Collapsible>
    </Collapsible>
  ),
};
