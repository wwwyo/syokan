import { Ellipsis, Trash2 } from "lucide-react";
import { SidebarToggle } from "@/components/AppSidebar/SidebarToggle";
import { ShareControls } from "@/components/ShareControls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type ViewHeaderProps = {
  sourceLabel?: string;
  onDelete?: () => void;
  /** 指定すると公開 (Share) 操作を出す */
  snapshotId?: string;
  /** 本文が fullBleed のとき帯の内側も幅制約を外して揃える */
  fullBleed?: boolean;
};

// snapshot のメタ情報 (source / 公開 / 削除操作) を出す viewer 用ヘッダ。
// catalog 描画 (env.root) の外側のクロムで、schema-driven の render tree には含まれない。
// 削除は誤操作を避けるため直置きせず ellipsis メニューの中に隠す。
// 公開 (Share) は発見されるよう flat に置く。
export function ViewHeader({
  sourceLabel,
  onDelete,
  snapshotId,
  fullBleed = false,
}: ViewHeaderProps) {
  return (
    <header
      data-slot="view-header"
      className="border-b border-border bg-background/95 backdrop-blur"
    >
      <div
        className={cn(
          "flex items-center justify-between gap-4 py-3 text-xs text-muted-foreground",
          fullBleed ? "px-4" : "mx-auto max-w-4xl px-6",
        )}
      >
        <div className="flex items-center gap-3">
          <SidebarToggle />
          {sourceLabel ? (
            <span
              data-slot="view-source"
              className="rounded-full border border-border px-2 py-0.5"
            >
              {sourceLabel}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {snapshotId ? <ShareControls snapshotId={snapshotId} /> : null}
          {onDelete ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                data-slot="view-menu-trigger"
                aria-label={t.view.moreActions}
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
                  {t.common.delete}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </header>
  );
}
