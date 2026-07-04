import { t } from "@/lib/i18n";
import type { SnapshotEnvelope } from "@/schema";
import { PageLayout } from "./components/PageLayout";
import { ViewHeader } from "./components/ViewHeader";
import { Render } from "./Render";

// root が resizable Stack のときだけ幅制約を外して全画面に広げる。
// 通常の縦積み (非 resizable / 記事一覧) は読みやすい max-w-4xl を維持する。
function isFullBleed(env: SnapshotEnvelope): boolean {
  const root = env.root;
  return (
    root.type === "Stack" &&
    (root.props as { resizable?: boolean }).resizable === true
  );
}

export type ViewPageProps = {
  envelope: SnapshotEnvelope;
  onDelete?: () => void;
};

export function ViewPage({ envelope, onDelete }: ViewPageProps) {
  const fullBleed = isFullBleed(envelope);
  return (
    <PageLayout
      fullBleed={fullBleed}
      header={
        <ViewHeader
          sourceLabel={envelope.metadata?.source?.label}
          onDelete={onDelete}
          fullBleed={fullBleed}
        />
      }
    >
      <Render item={envelope.root} />
    </PageLayout>
  );
}

// 取得中。route の pendingComponent。
export function ViewPending() {
  return (
    <PageLayout header={<ViewHeader />}>
      <p data-slot="view-loading" className="text-muted-foreground">
        {t.common.loading}
      </p>
    </PageLayout>
  );
}

// 存在しない id。route の notFoundComponent。home へは full reload で十分なので素の <a>。
export function ViewNotFound({ id }: { id: string }) {
  return (
    <PageLayout header={<ViewHeader />}>
      <div data-slot="view-not-found">
        <p className="text-muted-foreground">
          {t.view.notFoundBefore}
          <code className="font-mono">{id}</code>
          {t.view.notFoundAfter}
        </p>
        <p className="mt-6">
          <a className="text-primary underline underline-offset-4" href="/">
            {t.common.backToHome}
          </a>
        </p>
      </div>
    </PageLayout>
  );
}

// 取得失敗。route の errorComponent。
export function ViewError({ message }: { message: string }) {
  return (
    <PageLayout header={<ViewHeader />}>
      <p data-slot="view-error" className="text-destructive">
        {message}
      </p>
    </PageLayout>
  );
}
