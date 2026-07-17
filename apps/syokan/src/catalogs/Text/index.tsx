import { z } from "zod";
import { cn } from "../../lib/utils";

export const textPropsSchema = z
  .object({
    body: z.string().min(1),
    // dimmed display for supplementary text
    muted: z.boolean().optional(),
  })
  .strict();

export type TextProps = z.infer<typeof textPropsSchema>;

/** Short or supplementary text (single line or a few lines). */
export function Text({ body, muted }: TextProps) {
  return (
    <p
      data-slot="text"
      className={cn("text-sm leading-6", muted && "text-muted-foreground")}
    >
      {body}
    </p>
  );
}
