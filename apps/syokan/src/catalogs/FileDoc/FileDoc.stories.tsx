import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileDocBody } from ".";

// FileDoc itself is a container that fetches a file from the server. Storybook has no server, so we
// render the presentational FileDocBody — which takes a fetch state (loading / each error / markdown /
// text / code) — directly for visual review.
const meta = {
  title: "Catalog/FileDoc",
  component: FileDocBody,
  tags: ["autodocs"],
} satisfies Meta<typeof FileDocBody>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  args: { path: "/Users/me/notes.md", state: { kind: "loading" } },
};

export const Markdown: Story = {
  args: {
    path: "/Users/me/notes.md",
    state: {
      kind: "ok",
      content:
        "# Meeting notes\n\n- Decision A\n- Decision B\n\n```ts\nconst x = 1;\n```",
    },
  },
};

export const PlainLog: Story = {
  args: {
    path: "/var/log/app.log",
    state: {
      kind: "ok",
      content:
        "[12:00:01] INFO  started\n[12:00:02] WARN  cache miss\n[12:00:03] ERROR timeout",
    },
  },
};

export const Json: Story = {
  args: {
    path: "/Users/me/config.json",
    state: {
      kind: "ok",
      content: '{\n  "port": 5173,\n  "name": "syokan"\n}',
    },
  },
};

export const NotFound: Story = {
  args: {
    path: "/Users/me/deleted.md",
    state: { kind: "error", reason: "not_found" },
  },
};

export const TooLarge: Story = {
  args: {
    path: "/Users/me/huge.log",
    state: { kind: "error", reason: "too_large" },
  },
};

export const NotText: Story = {
  args: {
    path: "/Users/me/image.png",
    state: { kind: "error", reason: "not_text" },
  },
};
