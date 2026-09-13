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
          { id: "share", label: "apps/share" },
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
      { id: "d", label: "hotspot node (deprecated)", role: "hotspot" },
      { id: "e", label: "changed node", role: "changed" },
    ],
    edges: [
      { from: "a", to: "b", role: "added" },
      { from: "a", to: "c", role: "removed" },
      { from: "b", to: "d" },
      { from: "c", to: "d" },
      { from: "d", to: "e", role: "changed" },
    ],
    caption:
      "color means the change kind only (added/removed/changed/unchanged); the deprecated hotspot role renders identically to changed and gets no separate legend entry",
  },
};

export const FanOut: Story = {
  args: {
    nodes: [
      { id: "cli", label: "cli" },
      { id: "api", label: "POST /api/snapshots", role: "changed" },
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
    caption: "cycles still render (dagre handles them internally)",
  },
};

export const SingleNode: Story = {
  args: { nodes: [{ id: "only", label: "lonely node" }] },
};

export const Grouped: Story = {
  args: {
    direction: "TB",
    nodes: [
      { id: "routes", label: "routes.ts", role: "changed", group: "server" },
      { id: "store", label: "store.ts", group: "server" },
      { id: "share-service", label: "shareService.ts", group: "server" },
      { id: "render", label: "Render.tsx", group: "frontend" },
      { id: "graph", label: "Graph/index.tsx", role: "added", group: "frontend" },
    ],
    edges: [
      { from: "routes", to: "store" },
      { from: "routes", to: "share-service" },
      { from: "render", to: "graph" },
      { from: "routes", to: "render", label: "serves" },
    ],
    groups: [
      { id: "server", label: "apps/syokan/server" },
      { id: "frontend", label: "apps/syokan/src" },
    ],
    caption: "module boundaries via groups",
  },
};

export const WithHrefAndSub: Story = {
  args: {
    nodes: [
      { id: "routes", label: "routes.ts", role: "changed", sub: "added /api/probes/run" },
      {
        id: "probe",
        label: "Probe/index.tsx",
        role: "changed",
        sub: "unchecked path in search_count",
        href: "#finding-1",
      },
    ],
    edges: [{ from: "routes", to: "probe", role: "changed", label: "renders" }],
    caption: "href, not color, marks a finding: click the node to jump to it",
  },
};

/**
 * A realistic syokan review-panel example: the changed area is three modules, one node
 * per touched file, `sub` carrying the one-line "what changed", and the changed node's
 * `href` jumping to a `Card` finding elsewhere in the same view (see risk-panel.md).
 */
export const ChangedAreaOverview: Story = {
  args: {
    direction: "LR",
    nodes: [
      { id: "skill-md", label: "SKILL.md", role: "changed", sub: "pointer to risk-panel", group: "skill" },
      { id: "risk-panel", label: "risk-panel.md", role: "changed", group: "skill" },
      { id: "routes", label: "routes.ts", role: "neutral", group: "server" },
      {
        id: "graph",
        label: "Graph/index.tsx",
        role: "changed",
        sub: "React Flow renderer",
        href: "#finding-1",
        group: "catalogs",
      },
    ],
    edges: [
      { from: "skill-md", to: "risk-panel", label: "imports" },
      { from: "routes", to: "graph" },
    ],
    groups: [
      { id: "skill", label: "skills/syokan" },
      { id: "server", label: "apps/syokan/server" },
      { id: "catalogs", label: "apps/syokan/src/catalogs" },
    ],
    caption: "changes concentrate in the Graph renderer",
  },
};
