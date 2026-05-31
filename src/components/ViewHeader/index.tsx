import { formatDateTime } from "@/lib/date";

export type ViewHeaderProps = {
  createdAt: string;
  sourceLabel?: string;
  onDelete?: () => void;
};

// snapshot のメタ情報 (取得時刻 / source / 削除操作) を出す viewer 用ヘッダ。
// catalog 描画 (env.root) の外側のクロムで、schema-driven の render tree には含まれない。
export function ViewHeader({ createdAt, sourceLabel, onDelete }: ViewHeaderProps) {
  return (
    <header
      data-slot="view-header"
      className="border-b border-border bg-background/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-6 py-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <time data-slot="view-created-at" dateTime={createdAt}>
            {formatDateTime(createdAt)}
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
  );
}
