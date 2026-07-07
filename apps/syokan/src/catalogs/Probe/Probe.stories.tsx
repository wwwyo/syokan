import type { Meta, StoryObj } from "@storybook/react-vite";
import { Probe } from ".";

const meta = {
  title: "Catalog/Probe",
  component: Probe,
  tags: ["autodocs"],
} satisfies Meta<typeof Probe>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotRunYet: Story = {
  args: {
    label: "no stray console.log",
    check: {
      kind: "search_count",
      path: "/repo/src",
      pattern: "console.log",
      expected: 0,
    },
  },
};

export const Pass: Story = {
  args: {
    label: "behavior files untouched",
    check: {
      kind: "diff_clean",
      repo: "/repo",
      base: "main",
      paths: ["server/store.ts", "server/routes.ts"],
    },
    result: {
      status: "pass",
      detail: "no diff from main",
      ranAt: "2026-07-06T09:00:00Z",
      ref: { commit: "abc123def456abc123def456abc123def456abc1" },
    },
  },
};

export const Fail: Story = {
  args: {
    label: "no TODO left",
    check: {
      kind: "search_count",
      path: "/repo/src",
      pattern: "TODO",
      expected: 0,
      op: "max",
    },
    result: {
      status: "fail",
      detail: "3 matches in 41 files (expected <= 0)",
      ranAt: "2026-07-06T09:00:00Z",
    },
  },
};

export const ErrorResult: Story = {
  args: {
    label: "migration file exists",
    check: { kind: "file_exists", path: "/repo/migrations/0007.sql" },
    result: {
      status: "error",
      detail: "cannot read /repo/migrations (not_found)",
      ranAt: "2026-07-06T09:00:00Z",
    },
  },
};
