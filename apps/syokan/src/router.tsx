import {
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  useParams,
} from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useDeleteSnapshot } from "@/components/AppShell/useDeleteSnapshot";
import { PageLayout } from "@/components/PageLayout";
import { t } from "@/lib/i18n";
import { fetchSnapshotEnvelope, fetchSnapshotList } from "@/lib/snapshots";
import { Home } from "./Home";
import { ViewError, ViewNotFound, ViewPage, ViewPending } from "./ViewPage";

const rootRoute = createRootRoute();

// The pathless layout hosting the resident shell (sidebar + body). The sidebar's list fetch is
// concentrated in the loader and shared across all routes underneath (not re-run on child
// transitions; refreshed via invalidate only on focus).
// A fetch failure drops the whole shell to errorComponent — a state where the list can't be
// pulled loses the starting point for actions, so rather than leaving only the body, we error
// out together (an accepted trade-off).
const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_shell",
  loader: fetchSnapshotList,
  component: AppShell,
  errorComponent: () => (
    <PageLayout>
      <div data-slot="shell-error">
        <p className="text-destructive">{t.shell.listError}</p>
        <p className="mt-6">
          <a className="text-primary underline underline-offset-4" href="/">
            {t.shell.reload}
          </a>
        </p>
      </div>
    </PageLayout>
  ),
  // Catches notFound thrown under viewRoute etc. (rendered inside the shell). Unmatched URLs are
  // picked up by splatRoute below (a pathless layout unmatches itself when no child matches).
  notFoundComponent: RouteNotFound,
});

// Handles paths matching no child (a mistyped URL etc.) inside the shell. A full reload is
// enough for home, so a plain <a>.
function RouteNotFound() {
  return (
    <PageLayout>
      <div data-slot="route-not-found">
        <p className="text-muted-foreground">{t.shell.pageNotFound}</p>
        <p className="mt-6">
          <a className="text-primary underline underline-offset-4" href="/">
            {t.common.backToHome}
          </a>
        </p>
      </div>
    </PageLayout>
  );
}

const splatRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "$",
  component: RouteNotFound,
});

const homeRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/",
  component: Home,
});

// The human-facing page URL is /snapshots/:id (aligned with the API's /api/snapshots). Fetching is
// handled by the loader; pending / not-found / error branching is delegated to the route's components.
const viewRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/snapshots/$id",
  loader: async ({ params }) => {
    const envelope = await fetchSnapshotEnvelope(params.id);
    if (!envelope) throw notFound();
    return envelope;
  },
  component: ViewRouteComponent,
  pendingComponent: ViewPending,
  notFoundComponent: () => {
    const { id } = useParams({ strict: false }) as { id?: string };
    return <ViewNotFound id={id ?? ""} />;
  },
  errorComponent: ({ error }) => (
    <ViewError message={error instanceof Error ? error.message : String(error)} />
  ),
});

function ViewRouteComponent() {
  const envelope = viewRoute.useLoaderData();
  const del = useDeleteSnapshot();
  return (
    <ViewPage
      envelope={envelope}
      onDelete={() => del(envelope.id, { isCurrent: true })}
    />
  );
}

const routeTree = rootRoute.addChildren([
  shellRoute.addChildren([homeRoute, viewRoute, splatRoute]),
]);

export const router = createRouter({
  routeTree,
  // restores the body's reading position per history entry (replacing the bespoke scroll helper code).
  scrollRestoration: true,
  // prefetch the loader on hover / touch to make click transitions feel near-instant.
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
