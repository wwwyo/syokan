import { z } from "zod";
import { cn } from "../../lib/utils";

export const statPropsSchema = z
  .object({
    label: z.string().min(1),
    // string admits units and formatted values ("94%", "1.2s"); the renderer never reformats
    value: z.union([z.string().min(1), z.number()]),
    // optional change vs. a previous point ("+3", "-12%") with an explicit direction.
    // Direction drives the arrow and color; the producer owns its meaning (up isn't always good).
    delta: z
      .object({
        text: z.string().min(1),
        direction: z.enum(["up", "down", "flat"]).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type StatProps = z.infer<typeof statPropsSchema>;

const deltaStyles = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-red-600 dark:text-red-400",
  flat: "text-muted-foreground",
} as const;

const deltaArrows = { up: "↑", down: "↓", flat: "→" } as const;

/**
 * A labelled figure that stands out from body text — the at-a-glance summary at the
 * top of dashboard-like views (unread count, pass rate, delta since yesterday).
 * Line several up horizontally with Stack direction="horizontal".
 */
export function Stat({ label, value, delta }: StatProps) {
  const direction = delta?.direction ?? "flat";
  return (
    <div
      data-slot="stat"
      className="min-w-32 rounded-lg border bg-card px-4 py-3 text-card-foreground"
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">
          {value}
        </span>
        {delta && (
          <span
            data-slot="stat-delta"
            className={cn("text-sm font-medium", deltaStyles[direction])}
          >
            {deltaArrows[direction]} {delta.text}
          </span>
        )}
      </p>
    </div>
  );
}
