import { z } from "zod";
import { Badge as UIBadge } from "../../components/ui/badge";

export const badgePropsSchema = z
  .object({
    text: z.string().min(1),
    // Expose only the shadcn badge variants meant for status display.
    // ghost/link are for interaction and carry no meaning as status chips, so they're excluded.
    variant: z
      .enum(["default", "secondary", "destructive", "outline"])
      .optional(),
  })
  .strict();

export type BadgeProps = z.infer<typeof badgePropsSchema>;

/**
 * A leaf that shows a status / label as a color-coded chip. Used for at-a-glance state:
 * a PR's open/merged/closed, a review's approved/changes-requested, CI's pass/fail, etc.
 * The producer maps the color's meaning onto a variant.
 */
export function Badge({ text, variant }: BadgeProps) {
  return <UIBadge variant={variant}>{text}</UIBadge>;
}
