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
      { id: "e", label: "changed node", role: "changed" },
    ],
    edges: [
      { from: "a", to: "b", role: "added" },
      { from: "a", to: "c", role: "removed" },
      { from: "b", to: "d", role: "hotspot" },
      { from: "c", to: "d" },
      { from: "d", to: "e", role: "changed" },
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
      { id: "routes", label: "routes.ts", role: "hotspot", group: "server" },
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
        role: "hotspot",
        sub: "unchecked path in search_count",
        href: "#finding-1",
      },
    ],
    edges: [{ from: "routes", to: "probe", role: "hotspot", label: "renders" }],
    caption: "click the hotspot node to jump to its finding",
  },
};

/**
 * A realistic syokan review-panel example: the changed area is three modules, one node
 * per touched file, `sub` carrying the one-line "what changed", and the hotspot node's
 * `href` jumping to a `Card` finding elsewhere in the same view (see risk-panel.md).
 */
export const ChangedAreaOverview: Story = {
  args: {
    direction: "LR",
    nodes: [
      { id: "skill", label: "SKILL.md", role: "changed", sub: "pointer to risk-panel", group: "skill" },
      { id: "risk-panel", label: "risk-panel.md", role: "changed", group: "skill" },
      { id: "routes", label: "routes.ts", role: "neutral", group: "server" },
      {
        id: "graph",
        label: "Graph/index.tsx",
        role: "hotspot",
        sub: "React Flow renderer",
        href: "#finding-1",
        group: "catalogs",
      },
    ],
    edges: [
      { from: "skill", to: "risk-panel", label: "imports" },
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
