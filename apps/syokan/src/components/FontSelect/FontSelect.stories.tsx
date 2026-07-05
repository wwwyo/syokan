import type { Meta, StoryObj } from "@storybook/react-vite";
import { FontSelect } from ".";

// FontSelect は localStorage("syokan:font") を読み書きし --app-font-* を書き換える。
// プリセットを選ぶと実際に doc のフォントが切り替わる (Google フォントは動的読込)。
const meta = {
  title: "Components/FontSelect",
  component: FontSelect,
  tags: ["autodocs"],
} satisfies Meta<typeof FontSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
