import type { SnapshotEnvelope } from "@/schema";
import { PageLayout } from "./components/PageLayout";
import { ViewHeader } from "./components/ViewHeader";
import { Render } from "./Render";

export type ViewPageState =
  | { kind: "loading" }
  | { kind: "not-found"; id: string }
  | { kind: "error"; message: string }
  | { kind: "found"; envelope: SnapshotEnvelope };

export type ViewPageProps = {
  state: ViewPageState;
  onDelete?: () => void;
};

export function ViewPage({ state, onDelete }: ViewPageProps) {
  if (state.kind === "loading") {
    return (
      <PageLayout>
        <p data-slot="view-loading" className="text-muted-foreground">
          Loading…
        </p>
      </PageLayout>
    );
  }

  if (state.kind === "not-found") {
    return (
      <PageLayout>
        <div data-slot="view-not-found">
          <p className="text-muted-foreground">
            404 — Snapshot <code className="font-mono">{state.id}</code> not
            found.
          </p>
          <p className="mt-6">
            <a className="text-primary underline underline-offset-4" href="/">
              Back to home
            </a>
          </p>
        </div>
      </PageLayout>
    );
  }

  if (state.kind === "error") {
    return (
      <PageLayout>
        <p data-slot="view-error" className="text-destructive">
          {state.message}
        </p>
      </PageLayout>
    );
  }

  const env = state.envelope;
  const root = env.root;
  // root が resizable Stack のときだけ幅制約を外して全画面に広げる。
  // 通常の縦積み (非 resizable / 記事一覧) は読みやすい max-w-2xl を維持する。
  const fullBleed =
    root.type === "Stack" &&
    (root.props as { resizable?: boolean }).resizable === true;

  return (
    <PageLayout
      fullBleed={fullBleed}
      header={
        <ViewHeader
          sourceLabel={env.metadata?.source?.label}
          onDelete={onDelete}
          fullBleed={fullBleed}
        />
      }
    >
      <Render item={root} />
    </PageLayout>
  );
}
