import type { Meta, StoryObj } from "@storybook/react-vite";
import { Notice, NoticeDetail } from ".";

const meta = {
  title: "Components/Notice",
  component: Notice,
  tags: ["autodocs"],
} satisfies Meta<typeof Notice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MessageOnly: Story = {
  args: {
    slot: "demo-notice",
    className: "my-4",
    children: <p>File not found (it may have been deleted).</p>,
  },
};

/** A long token with no useful break points (a path, a hash) wraps at any character. */
export const WithPathDetail: Story = {
  args: {
    slot: "demo-notice",
    className: "my-4",
    children: (
      <>
        <p>The referenced file could not be read.</p>
        <NoticeDetail wrap="break">
          /Users/example/very/deeply/nested/directory/structure/review-panel-tree.json
        </NoticeDetail>
      </>
    ),
  },
};

/** How Mermaid uses it: the caret must stay under the token it points at, so the detail scrolls. */
export const WithCaretDetail: Story = {
  args: {
    slot: "mermaid-error",
    className: "mb-2",
    children: (
      <>
        <p>The diagram could not be rendered.</p>
        <NoticeDetail wrap="preserve">
          {`Parse error on line 2:
graph TD  A[Extract] -->|connect-rpc| call
------------------------------------------^
Expecting 'SEMI', 'NEWLINE', 'SPACE', 'EOF', got 'CALL'`}
        </NoticeDetail>
      </>
    ),
  },
};
