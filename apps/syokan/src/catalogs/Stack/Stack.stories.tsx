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

// Fragment で束ねると Children.toArray が子 1 個と数え panel が潰れる。
// 実アプリの Render は children を配列で渡すため、story も個別 child で再現する。
const paneA = (
  <Card>
    <Heading text="左 / 上" level={3} />
    <Text body="段落 A の本文。" muted />
  </Card>
);
const paneB = (
  <Card>
    <Heading text="右 / 下" level={3} />
    <Text body="段落 B の本文。" muted />
  </Card>
);

// 既定: 素の flex stack (resizable なし)
export const Default: Story = {
  args: { direction: "vertical" },
  render: (args) => (
    <Stack {...args}>
      {paneA}
      {paneB}
    </Stack>
  ),
};

// 横並び (resizable)。ハンドルは境界付近を hover した時のみ表示される
export const ResizableHorizontal: Story = {
  args: { direction: "horizontal", resizable: true },
  render: (args) => (
    <Stack {...args}>
      {paneA}
      {paneB}
    </Stack>
  ),
};

// 縦並び (resizable)
export const ResizableVertical: Story = {
  args: { direction: "vertical", resizable: true },
  render: (args) => (
    <Stack {...args}>
      {paneA}
      {paneB}
    </Stack>
  ),
};
