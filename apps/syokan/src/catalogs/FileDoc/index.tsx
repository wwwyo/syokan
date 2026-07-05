import { useEffect, useState } from "react";
import { z } from "zod";
import { Code } from "@/catalogs/Code";
import { MarkdownDoc } from "@/catalogs/MarkdownDoc";
import { PlainText } from "@/catalogs/PlainText";
import {
  codeLangForPath,
  fileBasename,
  inferFileFormat,
} from "@/lib/fileFormat";
import { t } from "@/lib/i18n";

export const fileDocPropsSchema = z
  .object({
    // The CLI resolves this to an absolute path before passing it. The server reads and watches this path as-is.
    path: z.string().min(1),
  })
  .strict();

export type FileDocProps = z.infer<typeof fileDocPropsSchema>;

// Match the error body (error field) of GET /api/files. Unknown / network failure falls to generic.
type FileErrorReason =
  | "not_found"
  | "not_regular_file"
  | "permission_denied"
  | "too_large"
  | "not_text"
  | "missing_path"
  | "network"
  | "error";

export type FileDocState =
  | { kind: "loading" }
  | { kind: "ok"; content: string }
  | { kind: "error"; reason: FileErrorReason };

const ERROR_MESSAGE: Record<FileErrorReason, string> = t.fileDoc.errors;

/** The presentational part that takes a fetch state and displays it. Storybook / tests render this directly. */
export function FileDocBody({
  path,
  state,
}: {
  path: string;
  state: FileDocState;
}) {
  if (state.kind === "loading") {
    return (
      <p data-slot="file-doc-loading" className="text-muted-foreground">
        {t.common.loading}
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <div
        data-slot="file-doc-error"
        className="my-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
      >
        <p>{ERROR_MESSAGE[state.reason]}</p>
        <p className="mt-1 break-all font-mono text-xs opacity-70">{path}</p>
      </div>
    );
  }
  const format = inferFileFormat(path);
  if (format === "markdown") return <MarkdownDoc body={state.content} />;
  if (format === "code") {
    return (
      <Code
        code={state.content}
        lang={codeLangForPath(path)}
        filename={fileBasename(path)}
      />
    );
  }
  return <PlainText body={state.content} />;
}

// Let the reason be derived from status alone even when the body can't be read (prevents a body
// parse failure from dropping specific reasons like 413/415 to generic).
const STATUS_REASON: Record<number, FileErrorReason> = {
  400: "missing_path",
  403: "permission_denied",
  404: "not_found",
  413: "too_large",
  415: "not_text",
  422: "not_regular_file",
};

export function reasonFromStatus(status: number, body: unknown): FileErrorReason {
  const fromBody = (body as { error?: string } | null)?.error;
  if (fromBody && fromBody in ERROR_MESSAGE) return fromBody as FileErrorReason;
  return STATUS_REASON[status] ?? "error";
}

/**
 * A catalog component that takes a file path, reads the content via the server, and delegates to
 * MarkdownDoc / PlainText / Code by extension inference. Subscribes to SSE (`/api/files/watch`) and
 * re-fetches the content on a change notification (forward sync). Also restores the latest content
 * on reconnect (after a server restart / connection loss).
 */
export function FileDoc({ path }: FileDocProps) {
  const [state, setState] = useState<FileDocState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    let loadId = 0;
    const controller = new AbortController();
    const query = `path=${encodeURIComponent(path)}`;

    async function load() {
      const id = ++loadId;
      try {
        const res = await fetch(`/api/files?${query}`, {
          signal: controller.signal,
        });
        if (!active || id !== loadId) return;
        if (res.ok) {
          const data = (await res.json()) as { content: string };
          if (active && id === loadId) {
            setState({ kind: "ok", content: data.content });
          }
          return;
        }
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        if (active && id === loadId) {
          setState({ kind: "error", reason: reasonFromStatus(res.status, body) });
        }
      } catch (err) {
        if (!active || (err as Error).name === "AbortError") return;
        if (id === loadId) setState({ kind: "error", reason: "network" });
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

  return <FileDocBody path={path} state={state} />;
}
