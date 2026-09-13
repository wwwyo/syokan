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
    // tints the whole card by meaning (severity/verdict), independent of delta's up/down framing.
    // Shares the emerald/amber/red/sky palette with Badge and Graph so the app reads as one system.
    tone: z.enum(["success", "warning", "danger", "info"]).optional(),
  })
  .strict();

export type StatProps = z.infer<typeof statPropsSchema>;

const deltaStyles = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-red-600 dark:text-red-400",
  flat: "text-muted-foreground",
} as const;

const deltaArrows = { up: "↑", down: "↓", flat: "→" } as const;

const toneStyles = {
  success: {
    card: "bg-emerald-500/10 border-emerald-500/40 dark:bg-emerald-500/15",
    value: "text-emerald-700 dark:text-emerald-300",
  },
  warning: {
    card: "bg-amber-500/15 border-amber-500/40 dark:bg-amber-500/20",
    value: "text-amber-700 dark:text-amber-300",
  },
  danger: {
    card: "bg-red-500/10 border-red-500/40 dark:bg-red-500/15",
    value: "text-red-700 dark:text-red-300",
  },
  info: {
    card: "bg-sky-500/10 border-sky-500/40 dark:bg-sky-500/15",
    value: "text-sky-700 dark:text-sky-300",
  },
} as const;

/**
 * A labelled figure that stands out from body text — the at-a-glance summary at the
 * top of dashboard-like views (unread count, pass rate, delta since yesterday).
 * Line several up horizontally with Stack direction="horizontal".
 */
export function Stat({ label, value, delta, tone }: StatProps) {
  const direction = delta?.direction ?? "flat";
  return (
    <div
      data-slot="stat"
      className={cn(
        "min-w-32 rounded-lg border bg-card px-4 py-3 text-card-foreground",
        tone !== undefined && toneStyles[tone].card,
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span
          className={cn(
            "text-2xl font-semibold tabular-nums tracking-tight",
            tone !== undefined && toneStyles[tone].value,
          )}
        >
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
