import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShareControls } from ".";

// Storybook には local server が無いため、公開中一覧や publish 結果は
// initialShares / initialDialog で注入して視覚レビューする。
const meta = {
  title: "Components/ShareControls",
  component: ShareControls,
  tags: ["autodocs"],
} satisfies Meta<typeof ShareControls>;

export default meta;
type Story = StoryObj<typeof meta>;

const share = {
  id: "abc-123",
  url: "https://syokan.dev/shares/abc-123",
  expiresAt: "2026-07-11T00:00:00Z",
};

export const Default: Story = {
  args: { snapshotId: "k3f9q2", initialShares: [] },
};

export const SharedChip: Story = {
  args: {
    snapshotId: "k3f9q2",
    initialShares: [
      share,
      {
        id: "def-456",
        url: "https://syokan.dev/shares/def-456",
        expiresAt: "2026-08-01T12:00:00Z",
      },
    ],
  },
};

export const DialogSuccess: Story = {
  args: {
    snapshotId: "k3f9q2",
    initialShares: [share],
    initialDialog: { kind: "success", share },
  },
};

export const DialogLoginRequired: Story = {
  args: {
    snapshotId: "k3f9q2",
    initialShares: [],
    initialDialog: { kind: "not_logged_in" },
  },
};

export const DialogError: Story = {
  args: {
    snapshotId: "k3f9q2",
    initialShares: [],
    initialDialog: {
      kind: "error",
      message: "Could not reach the share service.",
    },
  },
};
