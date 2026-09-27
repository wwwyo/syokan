import { Children, type ReactNode, useRef, useState } from "react";
import { z } from "zod";
import { Notice } from "../../components/Notice";
import { Checkbox } from "../../components/ui/checkbox";
import { useReveal } from "../../lib/anchor";
import { t } from "../../lib/i18n";
import { jsonEqual } from "../../lib/json";
import { labelOccurrenceAt } from "../../lib/labelOccurrence";
import { patchSnapshot } from "../../lib/snapshots";
import { cn } from "../../lib/utils";
import { useNodeUiState, useWritebackTarget } from "../../lib/viewState";
import { buttonInlineContentSchema, InlineContentView } from "../inline";

export const checklistPropsSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            // a checked item's label becomes a toggle button, so use the link-free inline set
            label: buttonInlineContentSchema,
            // on an id-carrying node this is the stored check state; on an id-less node
            // it is the initial state for device-local interactions
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
 * to the label line; the label re-opens it transiently; unchecking restores it.
 * On a node carrying an id inside a store-backed view, checks write back into the
 * snapshot (a conditional PATCH on the item's `checked`, addressed by label
 * correspondence rather than index) — the same check is then visible in GET
 * responses, other devices, and published shares. Without an id (or on a share
 * viewer) checks stay device-local UI state.
 */
export function Checklist({ items, children }: ChecklistProps) {
  const bodies = Children.toArray(children);
  const target = useWritebackTarget();
  // Store-backed checklists derive their marks from props.items — the device-local
  // override storage is unused, so park it (no storage reads, no refetch churn).
  const [overrides, setOverrides] = useNodeUiState<(boolean | null)[]>(
    "checks",
    [],
    target === null,
  );
  // Optimistic display for in-flight writebacks. Pending marks are cleared once the
  // store's truth comes back (the change notification refetch carries it in).
  const [pending, setPending] = useState<ReadonlyMap<number, boolean>>(new Map());
  // The value our queued writes will leave the store at, per item index — folded into
  // the next click's expect.items compare-and-set. A ref (not the pending state) so a
  // second click in the same render batch still builds on the latest queued value.
  const queuedRef = useRef(new Map<number, boolean>());
  // Bumped on a refused write: writes queued behind it assumed a store state that
  // never landed, so they can't land either — they skip their request instead of
  // cascading one refusal per click.
  const epochRef = useRef(0);
  // The last refused write, surfaced as an inline note until the next check attempt.
  const [writeFailed, setWriteFailed] = useState(false);
  const itemsRef = useRef(items);
  if (itemsRef.current !== items) {
    const prevItems = itemsRef.current;
    itemsRef.current = items;
    // A fresh fetch prunes the write marks it already reflects — but keep entries
    // still in flight: a refetch racing ahead of its own PATCH doesn't see the
    // write yet, and dropping its mark would build the next expect on state the
    // store is about to move off (a guaranteed conflict on the following click).
    const inFlight = (i: number, value: boolean): boolean => {
      const fresh = items[i];
      const prev = prevItems[i];
      return (
        fresh !== undefined &&
        prev !== undefined &&
        jsonEqual(fresh.label, prev.label) &&
        (fresh.checked ?? false) !== value
      );
    };
    for (const [i, value] of queuedRef.current) {
      if (!inFlight(i, value)) queuedRef.current.delete(i);
    }
    if (pending.size > 0) {
      const next = new Map<number, boolean>();
      for (const [i, value] of pending) {
        if (inFlight(i, value)) next.set(i, value);
      }
      if (next.size !== pending.size) setPending(next);
    }
  }
  // Serialize a node's writes so toggles land in click order — parallel PATCHes of
  // the same item could arrive out of order and leave the store on a stale value.
  const writeChain = useRef<Promise<unknown>>(Promise.resolve());
  const checked = items.map((item, i) =>
    target === null
      ? (overrides[i] ?? item.checked ?? false)
      : (pending.get(i) ?? item.checked ?? false),
  );
  const done = checked.filter(Boolean).length;
  const setChecked = (index: number, value: boolean) => {
    if (target === null) {
      const next = items.map((_, i) => overrides[i] ?? null);
      next[index] = value;
      setOverrides(next);
      return;
    }
    const item = items[index];
    if (item === undefined) return;
    // Identify the item by the label correspondence, not its index: the occurrence-th
    // item carrying this exact label.
    const occurrence = labelOccurrenceAt(items, index);
    // The precondition is the whole items array the store must still hold — a
    // compare-and-set, so a same-label insertion (or any drift) can't silently
    // shift `occurrence` onto a different item. Include the values our queued
    // writes will already have landed so consecutive toggles build on them.
    const expectedItems = items.map((entry, i) => {
      const queued = queuedRef.current.get(i);
      return queued === undefined ? entry : { ...entry, checked: queued };
    });
    queuedRef.current.set(index, value);
    setPending((prev) => new Map(prev).set(index, value));
    setWriteFailed(false);
    const epoch = epochRef.current;
    writeChain.current = writeChain.current
      .then(async () => {
        // A write queued behind a refusal assumed a store state that never
        // landed — its expect can't match, so don't send it. The fresh fetch
        // the refusal triggered re-renders the truth.
        if (epochRef.current !== epoch) return;
        const ok = await patchSnapshot(target.snapshotId, target.nodeId, {
          item: { label: item.label, occurrence },
          set: { checked: value },
          expect: { items: expectedItems },
        });
        if (ok) return;
        // The write didn't land — the store drifted from what was rendered. Every
        // write queued behind this one built its expect on it landing, so bump the
        // epoch to skip them all, revert every optimistic mark, pull the latest
        // tree, and surface the refusal once.
        epochRef.current++;
        queuedRef.current.clear();
        setPending(new Map());
        setWriteFailed(true);
        target.refresh();
      })
      // a throwing link must not poison the chain for the clicks that follow
      .then(
        () => undefined,
        () => undefined,
      );
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
      {writeFailed && (
        <Notice slot="checklist-writeback">{t.checklist.writebackFailed}</Notice>
      )}
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
  const folded = checked && !peek;
  const bodyHidden = body !== undefined && folded;
  // anchor navigation into a folded body re-opens it transiently (lib/anchor)
  const revealId = useReveal(bodyHidden, () => setPeek(true));
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
        <div className={cn("ml-6.5", bodyHidden && "hidden")} data-reveal={revealId}>
          {body}
        </div>
      )}
    </li>
  );
}
