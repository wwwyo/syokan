import { formatDateTime } from "@/lib/date";
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
};

export function ViewList({ items, currentId }: ViewListProps) {
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
        return (
          <li key={item.id}>
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
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <time dateTime={item.createdAt}>
                  {formatDateTime(item.createdAt)}
                </time>
                {item.source ? (
                  <span className="rounded-full border border-border px-1.5 py-0.5 whitespace-nowrap">
                    {item.source.label}
                  </span>
                ) : null}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
