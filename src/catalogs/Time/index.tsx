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
 * ISO datetime を受け取り、閲覧者のローカル TZ で整形して <time> 表示する。
 * 表示フォーマットを renderer 側 (formatDateTime) に集約し、LLM には機械可読な
 * ISO を渡させる。LLM が整形済み文字列を渡すと表記が view ごとにブレるため。
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
