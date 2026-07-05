import type { Meta, StoryObj } from "@storybook/react-vite";
import { FontSelect } from ".";

// FontSelect reads/writes localStorage("syokan:font") and rewrites --app-font-*.
// Picking a preset actually switches the document's font (Google fonts are loaded dynamically).
const meta = {
  title: "Components/FontSelect",
  component: FontSelect,
  tags: ["autodocs"],
} satisfies Meta<typeof FontSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
