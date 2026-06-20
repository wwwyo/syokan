import type { Meta, StoryObj } from "@storybook/react-vite";
import { FontSelect } from ".";

// FontSelect は localStorage("syokan:font") を読み書きし <html data-font> をトグルする。
// 押すと実際に doc のフォントが切り替わる。
const meta = {
  title: "Components/FontSelect",
  component: FontSelect,
  tags: ["autodocs"],
} satisfies Meta<typeof FontSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
