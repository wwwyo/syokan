import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { z } from "zod";
import { useReveal } from "../../lib/anchor";
import { cn } from "../../lib/utils";
import { useNodeUiState } from "../../lib/viewState";
import { buttonInlineContentSchema, InlineContentView } from "../inline";

export const collapsiblePropsSchema = z
  .object({
    // summary renders inside the toggle button, so it uses the link-free inline set
    summary: buttonInlineContentSchema,
    defaultOpen: z.boolean().optional(),
  })
  .strict();

export type CollapsibleProps = z.infer<typeof collapsiblePropsSchema> & {
  children?: ReactNode;
};

/**
 * A fold with a summary line: low-priority detail collapses instead of being deleted
 * (review evidence hunks, read RSS entries). Open/closed is device-local UI state —
 * give the node an id to keep it across reloads. Anchor navigation into a closed
 * fold opens it (lib/anchor).
 */
export function Collapsible({
  summary,
  defaultOpen = false,
  children,
}: CollapsibleProps) {
  const [open, setOpen] = useNodeUiState<boolean>("open", defaultOpen);
  const revealId = useReveal(!open, () => setOpen(true));
  return (
    <div data-slot="collapsible" className="flex flex-col">
      <button
        type="button"
        data-slot="collapsible-summary"
        className="flex cursor-pointer items-center gap-1.5 text-left text-sm"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronRightIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <InlineContentView content={summary} />
      </button>
      <div
        className={cn("ml-5.5 mt-1.5", !open && "hidden")}
        data-reveal={revealId}
      >
        {children}
      </div>
    </div>
  );
}
