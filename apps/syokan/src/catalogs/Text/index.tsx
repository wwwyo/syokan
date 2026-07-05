import { z } from "zod";
import { cn } from "../../lib/utils";

export const textPropsSchema = z
  .object({
    body: z.string().min(1),
    // dimmed display for supplementary text
    muted: z.boolean().optional(),
    // clamp to 3 lines (equivalent to the old ArticleCard summary line-clamp)
    clamp: z.boolean().optional(),
  })
  .strict();

export type TextProps = z.infer<typeof textPropsSchema>;

/** Short or supplementary text. For plain text that doesn't warrant the heavier MarkdownDoc. */
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
