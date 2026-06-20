import {
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  useParams,
} from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useDeleteSnapshot } from "@/components/AppShell/useDeleteSnapshot";
import { fetchSnapshotEnvelope } from "@/lib/snapshots";
import { Home } from "./Home";
import { ViewError, ViewNotFound, ViewPage, ViewPending } from "./ViewPage";

const rootRoute = createRootRoute({ component: AppShell });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Home,
});

// 人間が見るページ URL は据え置き (/views/:id)。取得は loader が担い、
// pending / not-found / error の出し分けは route の各 component に委ねる。
const viewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/views/$id",
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

const routeTree = rootRoute.addChildren([homeRoute, viewRoute]);

export const router = createRouter({
  routeTree,
  // 本文の読書位置を履歴 entry 単位で復元する (自前の scroll 補助コードを置き換える)。
  scrollRestoration: true,
  // hover / touch で loader を先読みし、クリック時の遷移を即時に近づける。
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
