import { Children, type ReactNode, useEffect, useId, useState } from "react";
import { z } from "zod";
import { Checkbox } from "../../components/ui/checkbox";
import { registerReveal } from "../../lib/anchor";
import { cn } from "../../lib/utils";
import { useNodeUiState } from "../../lib/viewState";
import { inlineContentSchema, InlineContentView } from "../inline";

export const checklistPropsSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            label: inlineContentSchema,
            // initial state from the producer; interactions live in device-local UI state
            checked: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type ChecklistProps = z.infer<typeof checklistPropsSchema> & {
  children?: ReactNode;
};

/**
 * Checkable enumeration (review points, TODO, procedures). children[i] is the expanded
 * body of items[i] (omit children for label-only lists). Checking an item folds its body
 * to the label line; the label re-opens it transiently; unchecking restores it. Checks are
 * device-local UI state, never written back to the snapshot (ephemeral principle) — give
 * the node an id to keep progress across reloads.
 */
export function Checklist({ items, children }: ChecklistProps) {
  const bodies = Children.toArray(children);
  const [overrides, setOverrides] = useNodeUiState<(boolean | null)[]>(
    "checks",
    [],
  );
  const checked = items.map((item, i) => overrides[i] ?? item.checked ?? false);
  const done = checked.filter(Boolean).length;
  const setChecked = (index: number, value: boolean) => {
    const next = items.map((_, i) => overrides[i] ?? null);
    next[index] = value;
    setOverrides(next);
  };
  return (
    <div data-slot="checklist" className="flex flex-col gap-2">
      <p
        data-slot="checklist-progress"
        className="text-xs tabular-nums text-muted-foreground"
      >
        {`${done}/${items.length}`}
      </p>
      <ul className="flex flex-col gap-2">
        {items.map((item, i) => (
          <ChecklistItem
            // biome-ignore lint/suspicious/noArrayIndexKey: static content, order never changes
            key={i}
            label={<InlineContentView content={item.label} />}
            checked={checked[i] ?? false}
            onCheckedChange={(value) => setChecked(i, value)}
            body={bodies[i]}
          />
        ))}
      </ul>
    </div>
  );
}

function ChecklistItem({
  label,
  checked,
  onCheckedChange,
  body,
}: {
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  body?: ReactNode;
}) {
  // transient re-open of a checked (folded) item; resets when the check changes
  const [peek, setPeek] = useState(false);
  const uid = useId();
  const folded = checked && !peek;
  const bodyHidden = body !== undefined && folded;
  // anchor navigation into a folded body re-opens it transiently (lib/anchor)
  useEffect(() => {
    if (!bodyHidden) return;
    return registerReveal(uid, () => setPeek(true));
  }, [bodyHidden, uid]);
  return (
    <li data-slot="checklist-item" className="flex flex-col gap-1.5">
      <span className="flex items-start gap-2.5">
        <Checkbox
          className="mt-1"
          checked={checked}
          onCheckedChange={(value) => {
            setPeek(false);
            onCheckedChange(value === true);
          }}
        />
        {body !== undefined && checked ? (
          <button
            type="button"
            data-slot="checklist-label"
            className={cn(
              "cursor-pointer text-left text-muted-foreground",
              folded && "line-clamp-1",
            )}
            title={peek ? undefined : "Show details"}
            onClick={() => setPeek(!peek)}
          >
            {label}
          </button>
        ) : (
          <span
            data-slot="checklist-label"
            className={cn(checked && "text-muted-foreground")}
          >
            {label}
          </span>
        )}
      </span>
      {body !== undefined && (
        <div
          className={cn("ml-6.5", bodyHidden && "hidden")}
          data-reveal={bodyHidden ? uid : undefined}
        >
          {body}
        </div>
      )}
    </li>
  );
}
