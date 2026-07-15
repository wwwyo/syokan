import { useState } from "react";
import { t } from "./lib/i18n";
import type { SnapshotEnvelope } from "./schema";
import { CodeSnippet } from "./components/CodeSnippet";
import { PageLayout } from "./components/PageLayout";
import { ViewHeader } from "./components/ViewHeader";
import { ViewStateProvider } from "./lib/viewState";
import { Render } from "./Render";

// Only when root is a resizable Stack, drop the width constraint and spread full-screen.
// Ordinary vertical stacks (non-resizable / article lists) keep the readable max-w-4xl.
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
  // Source view for eyeballing the posted envelope against the rendered result.
  // CodeSnippet (bare <pre>) instead of catalog Code: toggling remounts, which is
  // exactly the StrictMode-collapse-prone pattern for pierre File in dev.
  const [showSource, setShowSource] = useState(false);
  return (
    <PageLayout
      fullBleed={fullBleed}
      header={
        <ViewHeader
          sourceLabel={envelope.metadata?.source?.label}
          onDelete={onDelete}
          snapshotId={envelope.id}
          fullBleed={fullBleed}
          sourceShown={showSource}
          onToggleSource={() => setShowSource((v) => !v)}
        />
      }
    >
      {showSource ? (
        <CodeSnippet code={JSON.stringify(envelope, null, 2)} />
      ) : (
        <ViewStateProvider scopeKey={envelope.id}>
          <Render item={envelope.root} />
        </ViewStateProvider>
      )}
    </PageLayout>
  );
}

// While fetching. The route's pendingComponent.
export function ViewPending() {
  return (
    <PageLayout header={<ViewHeader />}>
      <p data-slot="view-loading" className="text-muted-foreground">
        {t.common.loading}
      </p>
    </PageLayout>
  );
}

// A nonexistent id. The route's notFoundComponent. A full reload is enough for home, so a plain <a>.
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

// Fetch failure. The route's errorComponent.
export function ViewError({ message }: { message: string }) {
  return (
    <PageLayout header={<ViewHeader />}>
      <p data-slot="view-error" className="text-destructive">
        {message}
      </p>
    </PageLayout>
  );
}
