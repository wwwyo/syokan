import { Children, type ReactNode } from "react";

export type ArticleListProps = {
  children?: ReactNode;
};

export function ArticleList({ children }: ArticleListProps) {
  const count = Children.count(children);
  if (count === 0) {
    return (
      <div
        data-slot="article-list-empty"
        className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"
      >
        No articles.
      </div>
    );
  }
  return (
    <div data-slot="article-list" className="flex flex-col gap-3">
      {children}
    </div>
  );
}
