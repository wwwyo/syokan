import type { ReactNode } from "react";
import { z } from "zod";
import { TagFilterContext } from "../../lib/tagFilter";
import { cn } from "../../lib/utils";
import { useNodeUiState } from "../../lib/viewState";

export const tagFilterPropsSchema = z
  .object({
    // the selectable chips, in display order. Descendant nodes opt in by carrying
    // a cross-cutting `tags` field; nodes without tags are never filtered out.
    tags: z.array(z.string().min(1)).min(1),
    label: z.string().min(1).optional(),
  })
  .strict();

export type TagFilterProps = z.infer<typeof tagFilterPropsSchema> & {
  children?: ReactNode;
};

/**
 * The container carrying the narrowing operation of the cross-cutting tag mechanism.
 * Selecting chips shows only descendants whose tags intersect the selection (e.g. only
 * High-severity cards); empty selection shows everything. Narrowing lives here, not on
 * individual types like Table. The selection is device-local UI state.
 */
export function TagFilter({ tags, label, children }: TagFilterProps) {
  const [selected, setSelected] = useNodeUiState<string[]>("filter", []);
  // stale persisted entries (tag list changed) must not silently filter
  const active = selected.filter((t) => tags.includes(t));
  const toggle = (tag: string) => {
    setSelected(
      active.includes(tag) ? active.filter((t) => t !== tag) : [...active, tag],
    );
  };
  return (
    <div data-slot="tag-filter" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {label !== undefined && (
          <span className="mr-1 text-xs text-muted-foreground">{label}</span>
        )}
        {tags.map((tag) => {
          const on = active.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              data-slot="tag-filter-chip"
              aria-pressed={on}
              className={cn(
                "cursor-pointer rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
              onClick={() => toggle(tag)}
            >
              {tag}
            </button>
          );
        })}
        {active.length > 0 && (
          <button
            type="button"
            data-slot="tag-filter-clear"
            className="cursor-pointer px-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setSelected([])}
          >
            clear
          </button>
        )}
      </div>
      <TagFilterContext.Provider value={active}>
        {children}
      </TagFilterContext.Provider>
    </div>
  );
}
