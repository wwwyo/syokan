import { Braces, Ellipsis, Trash2 } from "lucide-react";
import { SidebarToggle } from "../AppSidebar/SidebarToggle";
import { ShareControls } from "../ShareControls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";

export type ViewHeaderProps = {
  sourceLabel?: string;
  onDelete?: () => void;
  /** When provided, shows the publish (Share) action */
  snapshotId?: string;
  /** When the body is fullBleed, drop the width constraint inside the bar too so they align */
  fullBleed?: boolean;
  /** When provided, shows the source-JSON toggle */
  sourceShown?: boolean;
  onToggleSource?: () => void;
};

// The viewer header that surfaces a snapshot's meta info (source / publish / delete action).
// It is chrome outside the catalog render (env.root) and is not part of the schema-driven render tree.
// Delete is hidden inside the ellipsis menu rather than placed directly, to avoid accidental clicks.
// Publish (Share) is placed flat so it is discoverable.
export function ViewHeader({
  sourceLabel,
  onDelete,
  snapshotId,
  fullBleed = false,
  sourceShown = false,
  onToggleSource,
}: ViewHeaderProps) {
  return (
    <header
      data-slot="view-header"
      className="border-b border-border bg-background/95 backdrop-blur"
    >
      <div
        className={cn(
          "flex items-center justify-between gap-4 py-3 text-xs text-muted-foreground",
          fullBleed ? "px-4" : "mx-auto max-w-4xl px-6",
        )}
      >
        <div className="flex items-center gap-3">
          <SidebarToggle />
          {sourceLabel ? (
            <span
              data-slot="view-source"
              className="rounded-full border border-border px-2 py-0.5"
            >
              {sourceLabel}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {onToggleSource ? (
            <button
              type="button"
              data-slot="view-source-toggle"
              aria-pressed={sourceShown}
              aria-label={sourceShown ? t.view.showRendered : t.view.showJson}
              onClick={onToggleSource}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2 font-mono outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                sourceShown && "bg-muted text-foreground",
              )}
            >
              <Braces className="size-3.5" aria-hidden />
              JSON
            </button>
          ) : null}
          {snapshotId ? <ShareControls snapshotId={snapshotId} /> : null}
          {onDelete ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                data-slot="view-menu-trigger"
                aria-label={t.view.moreActions}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Ellipsis className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  data-slot="view-delete"
                  variant="destructive"
                  onClick={onDelete}
                >
                  <Trash2 />
                  {t.common.delete}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </header>
  );
}
