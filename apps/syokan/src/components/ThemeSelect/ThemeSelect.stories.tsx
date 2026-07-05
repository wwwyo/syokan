import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeSelect } from ".";

// ThemeSelect reads/writes localStorage("syokan:theme") and toggles <html>.dark directly.
// Pressing it in a story actually switches the document's theme (touching the same surface as Storybook's theme toolbar).
const meta = {
  title: "Components/ThemeSelect",
  component: ThemeSelect,
  tags: ["autodocs"],
} satisfies Meta<typeof ThemeSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
