import type { Meta, StoryObj } from "@storybook/react-vite";
import { Graph } from ".";

const meta = {
  title: "Catalog/Graph",
  component: Graph,
  tags: ["autodocs"],
} satisfies Meta<typeof Graph>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    nodes: [
      { id: "routes", label: "routes.ts" },
      { id: "store", label: "store.ts" },
      { id: "share", label: "share.ts" },
    ],
    edges: [
      { from: "routes", to: "store" },
      { from: "routes", to: "share" },
    ],
    caption: "current dependencies",
  },
};

export const BeforeAfter: Story = {
  args: { nodes: [{ id: "x" }] },
  render: () => (
    <div className="flex flex-row flex-wrap gap-8">
      <Graph
        nodes={[
          { id: "fe", label: "frontend" },
          { id: "share", label: "apps/share", role: "hotspot" },
        ]}
        edges={[{ from: "fe", to: "share", role: "removed" }]}
        caption="before: FE depends on apps/share directly"
      />
      <Graph
        nodes={[
          { id: "fe", label: "frontend" },
          { id: "proxy", label: "server/share.ts", role: "added" },
          { id: "share", label: "apps/share" },
        ]}
        edges={[
          { from: "fe", to: "proxy", role: "added" },
          { from: "proxy", to: "share", role: "added" },
        ]}
        caption="after: hc RPC via the local proxy"
      />
    </div>
  ),
};

export const AllRoles: Story = {
  args: {
    nodes: [
      { id: "a", label: "neutral node" },
      { id: "b", label: "added node", role: "added" },
      { id: "c", label: "removed node", role: "removed" },
      { id: "d", label: "hotspot node", role: "hotspot" },
    ],
    edges: [
      { from: "a", to: "b", role: "added" },
      { from: "a", to: "c", role: "removed" },
      { from: "b", to: "d", role: "hotspot" },
      { from: "c", to: "d" },
    ],
    caption: "role → color/stroke mapping is fixed by syokan",
  },
};

export const FanOut: Story = {
  args: {
    nodes: [
      { id: "cli", label: "cli" },
      { id: "api", label: "POST /api/snapshots", role: "hotspot" },
      { id: "store", label: "store" },
      { id: "render", label: "render" },
      { id: "sse", label: "SSE watch" },
    ],
    edges: [
      { from: "cli", to: "api" },
      { from: "api", to: "store" },
      { from: "api", to: "render" },
      { from: "api", to: "sse" },
    ],
  },
};

export const CycleDegradesGracefully: Story = {
  args: {
    nodes: [
      { id: "a", label: "a" },
      { id: "b", label: "b" },
    ],
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "a" },
    ],
    caption: "cycles still render (back edge points left)",
  },
};

export const SingleNode: Story = {
  args: { nodes: [{ id: "only", label: "lonely node" }] },
};
