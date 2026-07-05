import type { Meta, StoryObj } from "@storybook/react-vite";
import { MarkdownDoc } from ".";

const meta = {
  title: "Catalog/MarkdownDoc",
  component: MarkdownDoc,
  tags: ["autodocs"],
} satisfies Meta<typeof MarkdownDoc>;

export default meta;
type Story = StoryObj<typeof meta>;

const richBody = `# Heading 1

A paragraph of text. Includes **bold**, \`inline code\`, a [link](https://example.com), and ~~strikethrough~~.

## Bullet list

- Apple
- Orange
  - Nested

## Task list

- [x] Set up Storybook
- [ ] Write lots of stories
- [ ] Wire it into CI

## Table

| Layer | Role |
|---|---|
| memory | Long-term memory |
| view | Ephemeral dashboard |

## Quote

> This is a sample blockquote.

## Code block

\`\`\`ts
export function add(a: number, b: number): number {
  return a + b;
}
\`\`\`
`;

export const Rich: Story = {
  args: { body: richBody },
};

export const HeadingsAndText: Story = {
  args: {
    body: "# Title\n\n## Subheading\n\nA body paragraph. Followed by a second paragraph.\n",
  },
};

export const TableOnly: Story = {
  args: {
    body: "| key | value |\n|---|---|\n| a | 1 |\n| b | 2 |\n",
  },
};

export const Mermaid: Story = {
  args: {
    body: `# Mermaid

A \`\`\`mermaid fence in the text renders as a diagram.

\`\`\`mermaid
graph TD
  A[Claude Code] -->|JSON tree| B(POST /api/snapshots)
  B --> C{catalog}
  C --> D[React render]
\`\`\`

Sequence diagrams work the same way.

\`\`\`mermaid
sequenceDiagram
  CLI->>Server: POST snapshot
  Server-->>CLI: 201 id
\`\`\`
`,
  },
};

export const Empty: Story = {
  args: { body: "" },
};
