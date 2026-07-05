import type { Meta, StoryObj } from "@storybook/react-vite";
import { TreeDocBody } from ".";

// TreeDoc itself fetches a file from the server. Storybook has no server, so we render the
// presentational TreeDocBody — which takes a sync state (loading / subtree / each error /
// stale + error) — directly for visual review.
const meta = {
  title: "Catalog/TreeDoc",
  component: TreeDocBody,
  tags: ["autodocs"],
} satisfies Meta<typeof TreeDocBody>;

export default meta;
type Story = StoryObj<typeof meta>;

const tree = {
  type: "Stack",
  props: {},
  children: [
    { type: "Heading", props: { text: "Live dashboard" } },
    { type: "Text", props: { body: "This subtree comes from a synced JSON file." } },
  ],
};

export const Loading: Story = {
  args: {
    path: "/Users/me/dashboard.json",
    state: { root: null, error: null, loading: true },
  },
};

export const Synced: Story = {
  args: {
    path: "/Users/me/dashboard.json",
    state: { root: tree, error: null, loading: false },
  },
};

export const InitialInvalidJson: Story = {
  args: {
    path: "/Users/me/dashboard.json",
    state: { root: null, error: "invalid_json", loading: false },
  },
};

export const StaleAfterInvalidSave: Story = {
  args: {
    path: "/Users/me/dashboard.json",
    state: { root: tree, error: "invalid_tree", loading: false },
  },
};

export const NestedTreeDocRejected: Story = {
  args: {
    path: "/Users/me/dashboard.json",
    state: { root: null, error: "nested_treedoc", loading: false },
  },
};

export const NotFound: Story = {
  args: {
    path: "/Users/me/deleted.json",
    state: { root: null, error: "not_found", loading: false },
  },
};
