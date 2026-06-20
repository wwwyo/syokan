import { Trash2 } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import type { SnapshotSummary } from "@/schema";

export type RenderLinkArgs = {
  id: string;
  active: boolean;
  className: string;
  children: ReactNode;
};

export type ViewListProps = {
  items: SnapshotSummary[];
  /** 現在表示中の snapshot id。一致する行を active 表示する */
  currentId: string | null;
  /** 右クリックメニューの削除アクション。未指定ならメニューを出さない */
  onDelete?: (id: string) => void;
  /**
   * 行リンクの描画を差し替える。既定は素の <a> (Storybook / SSR test 用)。
   * 実アプリでは AppSidebar が client routing する <Link> を注入する。
   */
  renderLink?: (args: RenderLinkArgs) => ReactElement;
};

const defaultRenderLink = ({
  id,
  active,
  className,
  children,
}: RenderLinkArgs): ReactElement => (
  <a
    href={`/views/${encodeURIComponent(id)}`}
    aria-current={active ? "page" : undefined}
    className={className}
  >
    {children}
  </a>
);

export function ViewList({
  items,
  currentId,
  onDelete,
  renderLink = defaultRenderLink,
}: ViewListProps) {
  if (items.length === 0) {
    return (
      <p data-slot="view-list-empty" className="px-3 py-2 text-sm text-muted-foreground">
        まだ snapshot がありません
      </p>
    );
  }

  return (
    <ul data-slot="view-list" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = item.id === currentId;
        // 右クリックの対象は行リンク自身。render で trigger を合成し、左クリックの遷移は活かす。
        const link = renderLink({
          id: item.id,
          active,
          className: cn(
            "block rounded-md px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            active
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          ),
          children: (
            <>
              <span className="block truncate font-medium">
                {item.title ?? "(untitled)"}
              </span>
              {item.source ? (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  <span className="rounded-full border border-border px-1.5 py-0.5 whitespace-nowrap">
                    {item.source.label}
                  </span>
                </span>
              ) : null}
            </>
          ),
        });

        return (
          <li key={item.id}>
            {onDelete ? (
              <ContextMenu>
                <ContextMenuTrigger render={link} />
                <ContextMenuContent>
                  <ContextMenuItem
                    data-slot="view-list-delete"
                    variant="destructive"
                    onClick={() => onDelete(item.id)}
                  >
                    <Trash2 />
                    削除
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ) : (
              link
            )}
          </li>
        );
      })}
    </ul>
  );
}
