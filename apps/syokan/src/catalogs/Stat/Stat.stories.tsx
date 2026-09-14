import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stat } from ".";

const meta = {
  title: "Catalog/Stat",
  component: Stat,
  tags: ["autodocs"],
} satisfies Meta<typeof Stat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: "Unread", value: 12 },
};

export const WithDeltaUp: Story = {
  args: {
    label: "Unread",
    value: 12,
    delta: { text: "+3 from yesterday", direction: "up" },
  },
};

export const WithDeltaDown: Story = {
  args: {
    label: "Open findings",
    value: 4,
    delta: { text: "-2", direction: "down" },
  },
};

export const FlatDelta: Story = {
  args: { label: "Coverage", value: "94%", delta: { text: "±0" } },
};

export const Dashboard: Story = {
  args: { label: "", value: "" },
  render: () => (
    <div className="flex flex-row gap-4">
      <Stat label="High" value={2} delta={{ text: "+1", direction: "up" }} />
      <Stat label="Medium" value={5} />
      <Stat label="None (verified)" value={9} delta={{ text: "-3", direction: "down" }} />
    </div>
  ),
};

export const ToneSuccess: Story = {
  args: { label: "None (verified)", value: 9, tone: "success" },
};

export const ToneWarning: Story = {
  args: { label: "Medium", value: 5, tone: "warning" },
};

export const ToneDanger: Story = {
  args: { label: "High", value: 2, tone: "danger" },
};

export const ToneInfo: Story = {
  args: { label: "Unknown", value: 1, tone: "info" },
};

export const AllTones: Story = {
  args: { label: "", value: "" },
  render: () => (
    <div className="flex flex-row gap-4">
      <Stat label="High" value={2} tone="danger" />
      <Stat label="Medium" value={5} tone="warning" />
      <Stat label="None (verified)" value={9} tone="success" />
      <Stat label="Unknown" value={1} tone="info" />
      <Stat label="No tone" value={3} />
    </div>
  ),
};

export const LongLabelAndValue: Story = {
  args: {
    label: "Longest running verification pipeline duration",
    value: "1h 23m 45s",
    delta: { text: "+12m vs. previous run", direction: "up" },
  },
};
