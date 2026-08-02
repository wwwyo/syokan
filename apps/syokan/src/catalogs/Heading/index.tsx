import { z } from "zod";
import { httpUrl } from "../../lib/url";
import { cn } from "../../lib/utils";

export const headingPropsSchema = z
  .object({
    text: z.string().min(1),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    // If href is present, make the heading a link (expresses an article title etc. in one node)
    href: httpUrl
      .optional()
      .describe(
        "An http(s) URL that turns the whole heading into a link opening in a new tab, keeping heading semantics — an article title and its destination in one node. Omit for a plain heading; never emit a separate Link node just to make a title clickable.",
      ),
  })
  .strict();

export type HeadingProps = z.infer<typeof headingPropsSchema>;

const SIZE = {
  1: "text-3xl",
  2: "text-xl",
  3: "text-base",
} as const;

export function Heading({ text, level = 2, href }: HeadingProps) {
  const Tag = `h${level}` as "h1" | "h2" | "h3";
  return (
    <Tag
      data-slot="heading"
      className={cn("font-semibold tracking-tight", SIZE[level])}
    >
      {href ? (
        <a
          href={href}
          className="hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {text}
        </a>
      ) : (
        text
      )}
    </Tag>
  );
}
