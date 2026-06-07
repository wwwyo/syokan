import { z } from "zod";
import { httpUrl } from "@/lib/url";

export const linkPropsSchema = z
  .object({
    href: httpUrl,
    // ラベル。省略時は href 自体を表示する
    text: z.string().min(1).optional(),
  })
  .strict();

export type LinkProps = z.infer<typeof linkPropsSchema>;

/** 外部リンク 1 本。本文中の url 表示や「元記事へ」等に使う。 */
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
