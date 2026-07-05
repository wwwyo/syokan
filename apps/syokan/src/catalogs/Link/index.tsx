import { z } from "zod";
import { httpUrl } from "@/lib/url";

export const linkPropsSchema = z
  .object({
    href: httpUrl,
    // label; falls back to the href itself when omitted
    text: z.string().min(1).optional(),
  })
  .strict();

export type LinkProps = z.infer<typeof linkPropsSchema>;

/** A single external link. Used for inline urls, "to the original article", etc. */
export function Link({ href, text }: LinkProps) {
  return (
    <a
      data-slot="link"
      href={href}
      className="text-primary underline-offset-4 hover:underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {text ?? href}
    </a>
  );
}
