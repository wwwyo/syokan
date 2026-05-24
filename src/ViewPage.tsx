import type { SnapshotEnvelope } from "@/schema";
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

// 閲覧者のローカル TZ で表示する (機械可読な UTC は <time dateTime> 側に残す)。
function formatCreatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

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
  const sourceLabel = env.metadata?.source?.label;

  return (
    // min-h-screen は付けない。root (例 Page) 側が自前の高さを持つため二重に
    // すると content 高が viewport を超えて余計なスクロールが出る。
    <div data-slot="view-page" className="bg-background">
      <header
        data-slot="view-header"
        className="border-b border-border bg-background/95 backdrop-blur"
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-6 py-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <time data-slot="view-created-at" dateTime={env.createdAt}>
              {formatCreatedAt(env.createdAt)}
            </time>
            {sourceLabel ? (
              <span
                data-slot="view-source"
                className="rounded-full border border-border px-2 py-0.5"
              >
                {sourceLabel}
              </span>
            ) : null}
          </div>
          {onDelete ? (
            <button
              type="button"
              data-slot="view-delete"
              className="rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
              onClick={onDelete}
            >
              Delete
            </button>
          ) : null}
        </div>
      </header>
      <Render item={env.root} />
    </div>
  );
}
