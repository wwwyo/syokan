import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "../../catalogs/Card";
import { Heading } from "../../catalogs/Heading";
import { MarkdownDoc } from "../../catalogs/MarkdownDoc";
import { Stack } from "../../catalogs/Stack";
import { Text } from "../../catalogs/Text";
import { PageLayout } from ".";

const meta = {
  title: "Components/PageLayout",
  component: PageLayout,
  tags: ["autodocs"],
  // PageLayout composes the content column (max-w + padding). Show it filling the canvas to verify
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PageLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

// The root is always wrapped in PageLayout. The contents are bundled under a single root (Stack),
// and article cards are expressed by composing Card + Heading + Text (ArticleCard was removed).
export const Dashboard: Story = {
  render: () => (
    <PageLayout>
      <Stack>
        <Heading text="Today's RSS" level={2} />
        <Stack>
          <Card>
            <Heading
              text="Bun 1.3 has been released"
              level={3}
              href="https://bun.sh/blog/bun-v1.3"
            />
            <Text body="Stabilized HTML import and dev server improvements." muted clamp />
          </Card>
          <Card>
            <Heading
              text="Tailwind CSS v4's new engine"
              level={3}
              href="https://tailwindcss.com/blog/tailwindcss-v4"
            />
          </Card>
        </Stack>
        <Heading text="Meeting notes" level={2} />
        <MarkdownDoc
          body={"## Decisions\n\n- Restructure the catalog into composable primitives\n"}
        />
      </Stack>
    </PageLayout>
  ),
};
