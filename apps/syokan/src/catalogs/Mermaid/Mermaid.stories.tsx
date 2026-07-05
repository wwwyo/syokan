import type { Meta, StoryObj } from "@storybook/react-vite";
import { Mermaid } from ".";

const meta = {
  title: "Catalog/Mermaid",
  component: Mermaid,
  tags: ["autodocs"],
} satisfies Meta<typeof Mermaid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Flowchart: Story = {
  args: {
    code: "graph TD\n  A[Post envelope] --> B{valid?}\n  B -->|yes| C[Render]\n  B -->|no| D[400 validation_failed]",
  },
};

export const Sequence: Story = {
  args: {
    code: "sequenceDiagram\n  participant LLM\n  participant syokan\n  LLM->>syokan: POST /api/snapshots\n  syokan-->>LLM: view URL",
  },
};

export const ParseError: Story = {
  args: {
    code: "graph TD\n  A --> ???broken???",
  },
};
