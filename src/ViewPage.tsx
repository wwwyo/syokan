import type { SnapshotEnvelope } from "@/schema";
import { Render } from "./Render";
import { ViewHeader } from "./components/ViewHeader";

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
      <main
        data-slot="view-loading"
        className="min-h-screen bg-background text-foreground"
      >
        <div className="mx-auto max-w-2xl px-6 py-16 text-muted-foreground">
          Loading…
        </div>
      </main>
    );
  }

  if (state.kind === "not-found") {
    return (
      <main
        data-slot="view-not-found"
        className="min-h-screen bg-background text-foreground"
      >
        <div className="mx-auto max-w-2xl px-6 py-16">
          <h1 className="text-3xl font-semibold tracking-tight">404</h1>
          <p className="mt-3 text-muted-foreground">
            Snapshot <code className="font-mono">{state.id}</code> not found.
          </p>
          <p className="mt-6">
            <a className="text-primary underline underline-offset-4" href="/">
              Back to home
            </a>
          </p>
        </div>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main
        data-slot="view-error"
        className="min-h-screen bg-background text-foreground"
      >
        <div className="mx-auto max-w-2xl px-6 py-16">
          <h1 className="text-2xl font-semibold tracking-tight">Error</h1>
          <p className="mt-3 text-destructive">{state.message}</p>
        </div>
      </main>
    );
  }

  const env = state.envelope;

  return (
    // min-h-screen は付けない。root (例 Page) 側が自前の高さを持つため二重に
    // すると content 高が viewport を超えて余計なスクロールが出る。
    <div data-slot="view-page" className="bg-background">
      <ViewHeader
        createdAt={env.createdAt}
        sourceLabel={env.metadata?.source?.label}
        onDelete={onDelete}
      />
      <Render item={env.root} />
    </div>
  );
}
