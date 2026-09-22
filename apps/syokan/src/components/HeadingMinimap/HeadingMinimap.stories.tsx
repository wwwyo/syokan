import type { Meta, StoryObj } from "@storybook/react-vite";
import { Heading } from "../../catalogs/Heading";
import { Text } from "../../catalogs/Text";
import { PageLayout } from "../PageLayout";
import { HeadingMinimap } from ".";

// HeadingMinimap reads `[data-slot="heading"]` from the rendered DOM rather than props, so
// every story renders it through PageLayout with real Heading nodes rather than passing args —
// there is nothing to control via controls/args here.
const meta = {
  title: "Components/HeadingMinimap",
  component: HeadingMinimap,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof HeadingMinimap>;

export default meta;
type Story = StoryObj<typeof meta>;

function filler(sentences: number) {
  return Array.from(
    { length: sentences },
    (_, i) => `Paragraph ${i + 1} of filler text, long enough to make the page scroll.`,
  ).join(" ");
}

// PageLayout already mounts HeadingMinimap on its non-fullBleed branch; this story exists to
// see the minimap itself — scroll the canvas to watch the active tick follow, hover/focus the
// tick column to expand the text list, click an item to jump.
export const LongPage: Story = {
  render: () => (
    <PageLayout>
      <Heading text="Getting started" level={1} />
      <Text body={filler(6)} />
      <Heading text="Installation" level={2} />
      <Text body={filler(6)} />
      <Heading text="Homebrew" level={3} />
      <Text body={filler(4)} />
      <Heading text="curl install script" level={3} />
      <Text body={filler(4)} />
      <Heading text="Configuration" level={2} />
      <Text body={filler(6)} />
      <Heading text="XDG directories" level={3} />
      <Text body={filler(4)} />
      <Heading text="Troubleshooting" level={1} />
      <Text body={filler(8)} />
    </PageLayout>
  ),
};

// A single heading is below the two-heading minimum, so nothing renders — no minimap chrome
// competing with content on a short page that has nothing to navigate between.
export const SingleHeadingRendersNothing: Story = {
  render: () => (
    <PageLayout>
      <Heading text="Just one section" level={1} />
      <Text body="A short page with only one heading has no reason for a minimap." />
    </PageLayout>
  ),
};
