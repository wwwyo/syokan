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

// 常駐 shell (sidebar + 本文) を担う pathless layout。sidebar の一覧取得を loader に集約し、
// 配下の全 route で共有する (child 遷移では再実行されず、focus 時のみ invalidate で更新)。
// 取得失敗は shell 全体を errorComponent に落とす — 一覧が引けない状態は操作の起点を失う
// ので本文だけ残さず、まとめてエラーにする (許容した trade-off)。
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
  // viewRoute 配下等で throw された notFound の受け皿 (shell 内に出す)。未マッチ URL は
  // 下の splatRoute が拾う (pathless layout は子がマッチしないと自身もマッチしないため)。
  notFoundComponent: RouteNotFound,
});

// どの child にも一致しないパス (URL の打ち間違い等) を shell 内で受ける。home へは full
// reload で十分なので素の <a>。
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

// 人間が見るページ URL は /snapshots/:id (API の /api/snapshots と揃える)。取得は
// loader が担い、pending / not-found / error の出し分けは route の各 component に委ねる。
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
