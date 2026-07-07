// Inline node subset embeddable inside composite props (Table cells, Checklist labels).
// Kept as an explicit union (not the full itemSchema) so the allowed set is visible in
// the published JSON Schema (catalog-expansion FR7) and so composite types don't
// circularly depend on the catalog registry.

import { z } from "zod";
import { Badge, badgePropsSchema } from "./Badge";
import { Link, linkPropsSchema } from "./Link";
import { Text, textPropsSchema } from "./Text";
import { Time, timePropsSchema } from "./Time";

const textItem = z.object({ type: z.literal("Text"), props: textPropsSchema }).strict();
const linkItem = z.object({ type: z.literal("Link"), props: linkPropsSchema }).strict();
const badgeItem = z.object({ type: z.literal("Badge"), props: badgePropsSchema }).strict();
const timeItem = z.object({ type: z.literal("Time"), props: timePropsSchema }).strict();

export const inlineItemSchema = z.discriminatedUnion("type", [
  textItem,
  linkItem,
  badgeItem,
  timeItem,
]);

export type InlineItem = z.infer<typeof inlineItemSchema>;

// a cell / label: plain string, one inline node, or a run of inline nodes
export const inlineContentSchema = z.union([
  z.string(),
  inlineItemSchema,
  z.array(inlineItemSchema),
]);

export type InlineContent = z.infer<typeof inlineContentSchema>;

// Link is excluded: this feeds contexts that render inside a <button> (Collapsible
// summary, Checklist label), where a nested <a> is invalid interactive nesting and its
// click would bubble to toggle the control instead of navigating.
const buttonInlineItemSchema = z.discriminatedUnion("type", [
  textItem,
  badgeItem,
  timeItem,
]);

export const buttonInlineContentSchema = z.union([
  z.string(),
  buttonInlineItemSchema,
  z.array(buttonInlineItemSchema),
]);

export type ButtonInlineContent = z.infer<typeof buttonInlineContentSchema>;

function RenderInlineItem({ item }: { item: InlineItem }) {
  switch (item.type) {
    case "Text":
      return <Text {...item.props} />;
    case "Link":
      return <Link {...item.props} />;
    case "Badge":
      return <Badge {...item.props} />;
    case "Time":
      return <Time {...item.props} />;
  }
}

/** Renders inline content as a horizontal run. Strings render as-is. */
export function InlineContentView({ content }: { content: InlineContent }) {
  if (typeof content === "string") return <>{content}</>;
  const items = Array.isArray(content) ? content : [content];
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      {items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static content, order never changes
        <RenderInlineItem key={i} item={item} />
      ))}
    </span>
  );
}
