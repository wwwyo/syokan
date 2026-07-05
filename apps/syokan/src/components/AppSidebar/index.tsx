import { Link, useParams } from "@tanstack/react-router";
import { X } from "lucide-react";
import { shellRouteApi } from "../AppShell/shellRouteApi";
import { useDeleteSnapshot } from "../AppShell/useDeleteSnapshot";
import {
  SIDEBAR_ID,
  useSidebar,
} from "../PageLayout/sidebarContext";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { ViewList } from "./ViewList";

/**
 * A non-modal, push-style sidebar. When open it takes width as a flex sibling and pushes main
 * aside, so main stays operable while it is open. When closed it is width 0 + inert, so tab
 * focus never enters the inner links.
 *
 * It sits directly under the resident shell (AppShell) and is not re-mounted on transitions.
 * The list comes from the shell layout's loader, and the open/closed state and scroll position
 * survive without being reconstructed (there is no bespoke scroll restoration). Loading/failure
 * is deferred to the route's pending/error, so items are always present here.
 */
export function AppSidebar() {
  const sidebar = useSidebar();
  const open = sidebar?.open ?? false;
  const items = shellRouteApi.useLoaderData();
  const params = useParams({ strict: false }) as { id?: string };
  const currentId = params.id ?? null;
  const del = useDeleteSnapshot();

  return (
    <aside
      id={SIDEBAR_ID}
      data-slot="app-sidebar"
      aria-label={t.shell.sidebarLabel}
      inert={!open}
      className={cn(
        "sticky top-0 h-svh shrink-0 self-start overflow-hidden border-border transition-[width] duration-200 ease-in-out motion-reduce:transition-none",
        open ? "w-64 border-r" : "w-0",
      )}
    >
      <div className="flex h-full w-64 flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <Link
            to="/"
            className="text-sm font-semibold tracking-tight text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            syokan
          </Link>
          {/* Place a close control inside the sidebar too, so it can be closed even without a ViewHeader (not-found / pending / error) */}
          {sidebar ? (
            <button
              type="button"
              aria-label={t.shell.close}
              onClick={sidebar.toggle}
              className="-mr-1 flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          <ViewList
            items={items}
            currentId={currentId}
            onDelete={(id) => del(id, { isCurrent: id === currentId })}
            renderLink={({ id, active, className, children }) => (
              <Link
                to="/snapshots/$id"
                params={{ id }}
                aria-current={active ? "page" : undefined}
                className={className}
              >
                {children}
              </Link>
            )}
          />
        </nav>
      </div>
    </aside>
  );
}
