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

/** A diagram taller than the inline cap scrolls inside the card instead of stretching the page. */
export const Tall: Story = {
  args: {
    code: `graph TD\n${Array.from({ length: 30 }, (_, i) => `  N${i}[Step ${i}] --> N${i + 1}[Step ${i + 1}]`).join("\n")}`,
  },
};

/**
 * The raw source stays visible and mermaid's reason (line + offending token) is shown above it.
 * `call` is a flowchart keyword, so a bare node of that name fails to parse — the kind of trap
 * that is invisible without the message. Note that mermaid tolerates a lot (`A --> ???broken???`
 * parses as a label), so a case that actually throws has to be picked deliberately.
 */
export const ParseError: Story = {
  args: {
    code: "graph TD\n  A[Extract] -->|connect-rpc| call",
  },
};
