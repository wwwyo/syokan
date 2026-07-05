import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "../Card";
import { Heading } from "../Heading";
import { Text } from "../Text";
import { Stack } from ".";

const meta = {
  title: "Catalog/Stack",
  component: Stack,
  tags: ["autodocs"],
} satisfies Meta<typeof Stack>;

export default meta;
type Story = StoryObj<typeof meta>;

// bundling with a Fragment makes Children.toArray count a single child and collapse the panels.
// The real app's Render passes children as an array, so the story reproduces that with separate children.
const paneA = (
  <Card>
    <Heading text="Left / Top" level={3} />
    <Text body="Body of paragraph A." muted />
  </Card>
);
const paneB = (
  <Card>
    <Heading text="Right / Bottom" level={3} />
    <Text body="Body of paragraph B." muted />
  </Card>
);

// default: a plain flex stack (not resizable)
export const Default: Story = {
  args: { direction: "vertical" },
  render: (args) => (
    <Stack {...args}>
      {paneA}
      {paneB}
    </Stack>
  ),
};

// horizontal (resizable). The handle appears only when hovering near the boundary
export const ResizableHorizontal: Story = {
  args: { direction: "horizontal", resizable: true },
  render: (args) => (
    <Stack {...args}>
      {paneA}
      {paneB}
    </Stack>
  ),
};

// vertical (resizable)
export const ResizableVertical: Story = {
  args: { direction: "vertical", resizable: true },
  render: (args) => (
    <Stack {...args}>
      {paneA}
      {paneB}
    </Stack>
  ),
};
