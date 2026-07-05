import { z } from "zod";
import { formatDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";

export const timePropsSchema = z
  .object({
    datetime: z.iso.datetime(),
    muted: z.boolean().optional(),
  })
  .strict();

export type TimeProps = z.infer<typeof timePropsSchema>;

/**
 * Takes an ISO datetime and displays it as a <time>, formatted in the viewer's local TZ.
 * The display format is consolidated on the renderer side (formatDateTime) and the LLM is made to
 * pass machine-readable ISO, because a pre-formatted string from the LLM would drift in notation from view to view.
 */
export function Time({ datetime, muted }: TimeProps) {
  return (
    <time
      data-slot="time"
      dateTime={datetime}
      className={cn("text-sm", muted && "text-muted-foreground")}
    >
      {formatDateTime(datetime)}
    </time>
  );
}
