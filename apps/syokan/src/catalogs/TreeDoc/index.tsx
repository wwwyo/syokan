import { useEffect, useState } from "react";
import { z } from "zod";
import { t } from "../../lib/i18n";
import { absoluteLocalPath } from "../../lib/path";
import { parseTreeContent } from "../../lib/treeSource";
import { Render } from "../../Render";
import type { Item } from "../../schema";

export const treeDocPropsSchema = z
  .object({
    // The CLI resolves this to an absolute local path before passing it. The server reads and
    // watches this path as-is; relative paths and URLs are rejected at ingest.
    path: absoluteLocalPath,
  })
  .strict();

export type TreeDocProps = z.infer<typeof treeDocPropsSchema>;

// File-level reasons match the error body (error field) of GET /api/files; tree-level reasons
// (invalid_json / invalid_tree / nested_treedoc) come from parseTreeContent. Unknown / network
// failure falls to generic.
export type TreeDocErrorReason =
  | "not_found"
  | "not_regular_file"
  | "permission_denied"
  | "too_large"
  | "not_text"
  | "missing_path"
  | "invalid_path"
  | "network"
  | "error"
  | "invalid_json"
  | "invalid_tree"
  | "nested_treedoc";

export type TreeDocState = {
  /** The last successfully parsed subtree. Kept on later failures so a mid-write save never blanks the view. */
  root: Item | null;
  /** The current failure, shown alongside the stale root when one exists. */
  error: TreeDocErrorReason | null;
  loading: boolean;
};

const ERROR_MESSAGE: Record<TreeDocErrorReason, string> = t.treeDoc.errors;

/** The presentational part that takes a sync state and displays it. Storybook / tests render this directly. */
export function TreeDocBody({
  path,
  state,
}: {
  path: string;
  state: TreeDocState;
}) {
  if (state.loading && state.root === null && state.error === null) {
    return (
      <p data-slot="tree-doc-loading" className="text-muted-foreground">
        {t.common.loading}
      </p>
    );
  }
  return (
    <div data-slot="tree-doc">
      {state.error !== null && (
        <div
          data-slot="tree-doc-error"
          className="my-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
        >
          <p>
            {ERROR_MESSAGE[state.error]}
            {state.root !== null && ` ${t.treeDoc.staleNotice}`}
          </p>
          <p className="mt-1 break-all font-mono text-xs opacity-70">{path}</p>
        </div>
      )}
      {state.root !== null && <Render item={state.root} />}
    </div>
  );
}

// Let the reason be derived from status alone even when the body can't be read (prevents a body
// parse failure from dropping specific reasons like 413/415 to generic).
const STATUS_REASON: Record<number, TreeDocErrorReason> = {
  400: "missing_path",
  403: "permission_denied",
  404: "not_found",
  413: "too_large",
  415: "not_text",
  422: "not_regular_file",
};

export function reasonFromStatus(
  status: number,
  body: unknown,
): TreeDocErrorReason {
  const fromBody = (body as { error?: string } | null)?.error;
  if (fromBody && fromBody in ERROR_MESSAGE) {
    return fromBody as TreeDocErrorReason;
  }
  return STATUS_REASON[status] ?? "error";
}

/**
 * A catalog component that takes a catalog-tree JSON file path, reads the content via the server,
 * validates it, and renders it as a live subtree. Subscribes to SSE (`/api/files/watch`) and
 * re-fetches the content on a change notification (forward sync). Also restores the latest content
 * on reconnect (after a server restart / connection loss).
 */
export function TreeDoc({ path }: TreeDocProps) {
  const [state, setState] = useState<TreeDocState>({
    root: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let active = true;
    let loadId = 0;
    const controller = new AbortController();
    const query = `path=${encodeURIComponent(path)}`;

    // A changed path points at a different file — the previous subtree is not "last valid content"
    // for it, so drop it instead of showing it as stale (costs one redundant render on mount).
    setState({ root: null, error: null, loading: true });

    function fail(reason: TreeDocErrorReason) {
      setState((prev) => ({ root: prev.root, error: reason, loading: false }));
    }

    async function load() {
      const id = ++loadId;
      try {
        const res = await fetch(`/api/files?${query}`, {
          signal: controller.signal,
        });
        if (!active || id !== loadId) return;
        if (res.ok) {
          const data = (await res.json()) as { content: string };
          if (!active || id !== loadId) return;
          const parsed = parseTreeContent(data.content);
          if (parsed.ok) {
            setState({ root: parsed.root, error: null, loading: false });
          } else {
            fail(parsed.reason);
          }
          return;
        }
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        if (active && id === loadId) fail(reasonFromStatus(res.status, body));
      } catch (err) {
        if (!active || (err as Error).name === "AbortError") return;
        if (id === loadId) fail("network");
      }
    }

    void load();

    // SSE connection = subscription. Re-fetch on change. Also re-fetch on every (re)connect, so
    // that even if the initial fetch failed (server briefly down) it recovers once first connected,
    // and on reconnect it picks up changes missed while disconnected (including restoring the latest
    // content after a server restart). Duplicate loads are collapsed via loadId.
    const source = new EventSource(`/api/files/watch?${query}`);
    source.addEventListener("change", () => {
      void load();
    });
    source.addEventListener("open", () => {
      void load();
    });

    return () => {
      active = false;
      controller.abort();
      source.close();
    };
  }, [path]);

  return <TreeDocBody path={path} state={state} />;
}
