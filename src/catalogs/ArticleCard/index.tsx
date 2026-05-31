import { z } from "zod";
import { formatDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";

export const articleCardPropsSchema = z
  .object({
    title: z.string().min(1),
    url: z.url(),
    summary: z.string().optional(),
    publishedAt: z.iso.datetime().optional(),
  })
  .strict();

export type ArticleCardProps = z.infer<typeof articleCardPropsSchema>;

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
          <time dateTime={publishedAt}>{formatDateTime(publishedAt)}</time>
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
