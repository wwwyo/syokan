import { Ellipsis, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTime } from "@/lib/date";

export type ViewHeaderProps = {
  createdAt: string;
  sourceLabel?: string;
  onDelete?: () => void;
};

// snapshot のメタ情報 (取得時刻 / source / 削除操作) を出す viewer 用ヘッダ。
// catalog 描画 (env.root) の外側のクロムで、schema-driven の render tree には含まれない。
// 削除は誤操作を避けるため直置きせず ellipsis メニューの中に隠す。
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
          <DropdownMenu>
            <DropdownMenuTrigger
              data-slot="view-menu-trigger"
              aria-label="More actions"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Ellipsis className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                data-slot="view-delete"
                variant="destructive"
                onClick={onDelete}
              >
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </header>
  );
}
