import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeSelect } from ".";

// ThemeSelect は localStorage("syokan:theme") を読み書きし <html>.dark を直接トグルする。
// story 上で押すと実際に doc のテーマが切り替わる (Storybook の theme toolbar と同じ面を触る)。
const meta = {
  title: "Components/ThemeSelect",
  component: ThemeSelect,
  tags: ["autodocs"],
} satisfies Meta<typeof ThemeSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
