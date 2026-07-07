import type { Meta, StoryObj } from "@storybook/react-vite";
import { TagFilter } from ".";
import { Render } from "../../Render";

const meta = {
  title: "Catalog/TagFilter",
  component: TagFilter,
  tags: ["autodocs"],
} satisfies Meta<typeof TagFilter>;

export default meta;
type Story = StoryObj<typeof meta>;

// filtering acts on Render's node wrappers, so stories go through Render
export const FilterCards: Story = {
  args: { tags: ["High", "Medium", "None"], label: "Severity" },
  render: (args) => (
    <TagFilter {...args}>
      <Render
        item={{
          type: "Stack",
          props: {},
          children: [
            {
              type: "Text",
              props: { body: "High: share token logged in plain text" },
              tags: ["High"],
            },
            {
              type: "Text",
              props: { body: "Medium: retry lacks idempotency key" },
              tags: ["Medium"],
            },
            {
              type: "Text",
              props: { body: "None: authz on share endpoints (verified)" },
              tags: ["None"],
            },
            {
              type: "Text",
              props: { body: "Untagged nodes are never filtered out." },
            },
          ],
        }}
      />
    </TagFilter>
  ),
};
