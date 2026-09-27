import { Outlet, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "../AppSidebar";
import { SidebarProvider } from "../PageLayout/sidebarContext";
import { useResizeScrollAnchor } from "./useResizeScrollAnchor";

// During client transitions the open/closed state lives in memory (the resident shell);
// only what needs to survive a hard reload is spilled to localStorage (guarded, since
// storage-disabled environments can throw).
const SIDEBAR_STORAGE_KEY = "syokan:sidebar-open";

// Unset (first visit) defaults to open. Only an explicit close choice is remembered as "0".
function readPersistedOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * The resident shell for all client routing. The sidebar and content column mount exactly
 * once, and route transitions swap only the contents of <Outlet />. This keeps the sidebar's
 * open/closed state, scroll position, and already-fetched list alive across transitions.
 *
 * The body defers to document(window) scrolling; the sidebar is pinned to the viewport via
 * sticky. Restoring the reading position across history navigation is the router's
 * scrollRestoration job (untouched here); useResizeScrollAnchor covers the separate case of the
 * content column changing width (window resize / sidebar toggle) and reflowing the current
 * page's content under a fixed pixel scroll position.
 */
export function AppShell() {
  const router = useRouter();
  const [open, setOpen] = useState(readPersistedOpen);

  const pageColumnRef = useResizeScrollAnchor();

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, open ? "1" : "0");
    } catch {
      // In storage-unavailable environments, give up on persistence (does not affect the feature itself)
    }
  }, [open]);

  // Store mutations (post/put/patch/delete from CLI, LLM, or this view's own writeback)
  // arrive as SSE change notifications. Re-run the shell loader on every change so the
  // sidebar follows, and re-run the view loader only when the change targets the open
  // snapshot — which also surfaces a deletion of the open view as not-found. The
  // focus/visibility refetch below stays as the floor for events missed while
  // disconnected (mutations by another server process never reach this stream).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const source = new EventSource("/api/snapshots/changes");
    let connected = false;
    source.addEventListener("change", (event) => {
      const change = JSON.parse(event.data as string) as { id?: unknown };
      const id = typeof change.id === "string" ? change.id : undefined;
      void router.invalidate({
        filter: (m) =>
          m.routeId === "/_shell" ||
          (m.routeId === "/_shell/snapshots/$id" && m.params.id === id),
      });
    });
    source.addEventListener("open", () => {
      // A reconnect means events may have been missed — resync once. The first open
      // right after mount would only duplicate the fresh loader fetch.
      if (connected) void router.invalidate();
      connected = true;
    });
    return () => source.close();
  }, [router]);

  // Snapshot creation happens outside the app (CLI/LLM), so there is no in-app trigger. On
  // tab return / becoming visible, re-fetch only the shell loader so an app left open also
  // picks up the new list. Being a background revalidation, stale-while-revalidate means the
  // list never flickers.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onActive = () => {
      if (document.visibilityState !== "hidden") {
        void router.invalidate({ filter: (m) => m.routeId === "/_shell" });
      }
    };
    window.addEventListener("focus", onActive);
    document.addEventListener("visibilitychange", onActive);
    return () => {
      window.removeEventListener("focus", onActive);
      document.removeEventListener("visibilitychange", onActive);
    };
  }, [router]);

  const sidebar = useMemo(
    () => ({ open, toggle: () => setOpen((v) => !v) }),
    [open],
  );

  return (
    <SidebarProvider value={sidebar}>
      <div
        data-slot="app-shell"
        className="flex min-h-svh w-full bg-background text-foreground"
      >
        <AppSidebar />
        <div
          ref={pageColumnRef}
          data-slot="page-column"
          className="flex min-w-0 flex-1 flex-col"
        >
          <Outlet />
        </div>
      </div>
    </SidebarProvider>
  );
}
