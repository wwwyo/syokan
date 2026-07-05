import { Trash2 } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { SnapshotSummary } from "@/schema";

export type RenderLinkArgs = {
  id: string;
  active: boolean;
  className: string;
  children: ReactNode;
};

export type ViewListProps = {
  items: SnapshotSummary[];
  /** The id of the snapshot currently on display. The matching row is shown as active */
  currentId: string | null;
  /** The delete action for the right-click menu. If unset, the menu is not shown */
  onDelete?: (id: string) => void;
  /**
   * Replace the rendering of the row link. The default is a bare <a> (for Storybook / SSR tests).
   * In the real app, AppSidebar injects a client-routing <Link>.
   */
  renderLink?: (args: RenderLinkArgs) => ReactElement;
};

const defaultRenderLink = ({
  id,
  active,
  className,
  children,
}: RenderLinkArgs): ReactElement => (
  <a
    href={`/snapshots/${encodeURIComponent(id)}`}
    aria-current={active ? "page" : undefined}
    className={className}
  >
    {children}
  </a>
);

export function ViewList({
  items,
  currentId,
  onDelete,
  renderLink = defaultRenderLink,
}: ViewListProps) {
  if (items.length === 0) {
    return (
      <p data-slot="view-list-empty" className="px-3 py-2 text-sm text-muted-foreground">
        {t.shell.emptyList}
      </p>
    );
  }

  return (
    <ul data-slot="view-list" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = item.id === currentId;
        // The right-click target is the row link itself. Compose the trigger at render, keeping the left-click navigation.
        const link = renderLink({
          id: item.id,
          active,
          className: cn(
            "block rounded-md px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            active
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          ),
          children: (
            <>
              <span className="block truncate font-medium">
                {item.title ?? "(untitled)"}
              </span>
              {item.source ? (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  <span className="rounded-full border border-border px-1.5 py-0.5 whitespace-nowrap">
                    {item.source.label}
                  </span>
                </span>
              ) : null}
            </>
          ),
        });

        return (
          <li key={item.id}>
            {onDelete ? (
              <ContextMenu>
                <ContextMenuTrigger render={link} />
                <ContextMenuContent>
                  <ContextMenuItem
                    data-slot="view-list-delete"
                    variant="destructive"
                    onClick={() => onDelete(item.id)}
                  >
                    <Trash2 />
                    {t.common.delete}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ) : (
              link
            )}
          </li>
        );
      })}
    </ul>
  );
}
