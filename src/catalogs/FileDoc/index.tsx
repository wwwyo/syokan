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

export const fileDocPropsSchema = z
  .object({
    // CLI が絶対パスに解決して渡す。サーバはこの path をそのまま読み・監視する。
    path: z.string().min(1),
  })
  .strict();

export type FileDocProps = z.infer<typeof fileDocPropsSchema>;

// GET /api/files のエラー本文 (error フィールド) と一致させる。未知/ネットワーク断は generic。
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

const ERROR_MESSAGE: Record<FileErrorReason, string> = {
  not_found: "ファイルが見つかりません（削除された可能性があります）。",
  not_regular_file: "通常ファイルではないため表示できません。",
  permission_denied: "読み取り権限がありません。",
  too_large: "ファイルが大きすぎるため表示できません（上限 2 MiB）。",
  not_text: "テキストとして表示できません（バイナリ / 非 UTF-8）。",
  missing_path: "パスが指定されていません。",
  network: "読み込みに失敗しました（サーバに接続できません）。",
  error: "読み込みに失敗しました。",
};

/** 取得状態を受け取り表示する presentational 部。Storybook / test はここを直接描画する。 */
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
        読み込み中…
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

// body が読めなくても status だけで理由を引けるようにする (本文 parse 失敗で
// 413/415 等の具体的理由が generic に落ちるのを防ぐ)。
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
 * ファイルパスを受け取り、サーバ経由で内容を読み、拡張子推論で MarkdownDoc / PlainText /
 * Code に委譲する catalog component。SSE (`/api/files/watch`) を購読し、変更通知を受けて
 * 内容を取り直す (forward sync)。再接続 (サーバ再起動 / 通信断後) でも最新内容を復元する。
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

    // SSE 接続 = 購読。change で取り直す。さらに (再)接続のたびに取り直して、初回 fetch が
    // 失敗 (server 一時ダウン) していても最初に接続できた時点で復帰させ、再接続時は切断中に
    // 見落とした変更も回収する (サーバ再起動後の最新内容復元を含む)。重複 load は loadId で畳む。
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
