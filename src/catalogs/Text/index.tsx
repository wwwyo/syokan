import { z } from "zod";
import { cn } from "@/lib/utils";

export const textPropsSchema = z
  .object({
    body: z.string().min(1),
    // 補足テキスト向けの淡色表示
    muted: z.boolean().optional(),
    // 3 行で省略 (旧 ArticleCard summary の line-clamp 相当)
    clamp: z.boolean().optional(),
  })
  .strict();

export type TextProps = z.infer<typeof textPropsSchema>;

/** 短文・補足テキスト。重い MarkdownDoc を使うまでもない素のテキスト用。 */
export function Text({ body, muted, clamp }: TextProps) {
  return (
    <p
      data-slot="text"
      className={cn(
        "text-sm leading-6",
        muted && "text-muted-foreground",
        clamp && "line-clamp-3",
      )}
    >
      {body}
    </p>
  );
}
