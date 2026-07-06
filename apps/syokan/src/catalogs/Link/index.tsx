import { z } from "zod";
import { httpUrl } from "../../lib/url";
import { AnchorLink } from "../../components/NodeWrapper";

// "#<node id>" targets a node in the same view (the cross-cutting anchor mechanism)
const anchorRef = z
  .string()
  .regex(/^#.+/, "In-view anchors are written as #<node id>");

export const linkPropsSchema = z
  .object({
    href: z.union([httpUrl, anchorRef]),
    // label; falls back to the href itself when omitted
    text: z.string().min(1).optional(),
  })
  .strict();

export type LinkProps = z.infer<typeof linkPropsSchema>;

const linkClass = "text-primary underline-offset-4 hover:underline";

/**
 * A single link. External http(s) urls open in a new tab; "#<node id>" hrefs
 * navigate within the view to the node carrying that id (revealing it if hidden).
 */
export function Link({ href, text }: LinkProps) {
  if (href.startsWith("#")) {
    return (
      <AnchorLink nodeId={href.slice(1)} className={linkClass}>
        {text ?? href}
      </AnchorLink>
    );
  }
  return (
    <a
      data-slot="link"
      href={href}
      className={linkClass}
      target="_blank"
      rel="noopener noreferrer"
    >
      {text ?? href}
    </a>
  );
}
