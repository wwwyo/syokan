import { cn } from "@/lib/utils";

export type ArticleCardProps = {
  title: string;
  url: string;
  summary?: string;
  publishedAt?: string;
};

function formatPublishedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  // 閲覧者のローカル TZ で YYYY-MM-DD HH:mm 表示 (UTC は <time dateTime> に残す)
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export function ArticleCard({
  title,
  url,
  summary,
  publishedAt,
}: ArticleCardProps) {
  return (
    <article
      data-slot="article-card"
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground",
        "p-4 shadow-sm transition-shadow hover:shadow",
      )}
    >
      <h3 className="text-base font-semibold tracking-tight">
        <a
          href={url}
          className="text-foreground hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {title}
        </a>
      </h3>
      {summary ? (
        <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
          {summary}
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        {publishedAt ? (
          <time dateTime={publishedAt}>{formatPublishedAt(publishedAt)}</time>
        ) : null}
        <a
          href={url}
          className="truncate text-primary underline-offset-4 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {url}
        </a>
      </div>
    </article>
  );
}
