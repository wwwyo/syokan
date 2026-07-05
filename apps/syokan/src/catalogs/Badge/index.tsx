import { z } from "zod";
import { Badge as UIBadge } from "@/components/ui/badge";

export const badgePropsSchema = z
  .object({
    text: z.string().min(1),
    // shadcn badge の status 表示向け variant のみ公開する。
    // ghost/link は interaction 用途で、状態チップとしては意味を持たないため除外。
    variant: z
      .enum(["default", "secondary", "destructive", "outline"])
      .optional(),
  })
  .strict();

export type BadgeProps = z.infer<typeof badgePropsSchema>;

/**
 * 状態 / label を色分けチップで示す leaf。PR の open/merged/closed、
 * review の approved/changes-requested、CI の pass/fail 等の一目把握に使う。
 * 色の意味付けは producer 側で variant にマップする。
 */
export function Badge({ text, variant }: BadgeProps) {
  return <UIBadge variant={variant}>{text}</UIBadge>;
}
