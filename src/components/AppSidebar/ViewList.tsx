import { Trash2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";

export type ViewSummary = {
  id: string;
  title?: string;
  createdAt: string;
  source?: { label: string };
};

export type ViewListProps = {
  items: ViewSummary[];
  /** 現在表示中の snapshot id。一致する行を active 表示する */
  currentId: string | null;
  /** 右クリックメニューの削除アクション。未指定ならメニューを出さない */
  onDelete?: (id: string) => void;
};

export function ViewList({ items, currentId, onDelete }: ViewListProps) {
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
        // 右クリックの対象は行 (anchor) 自身。render で trigger を anchor に合成し、
        // 左クリックの遷移はそのまま活かす。
        const link = (
          <a
            href={`/views/${encodeURIComponent(item.id)}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "block rounded-md px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
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
          </a>
        );

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
