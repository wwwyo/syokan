import type { ReactNode } from "react";

export type PageProps = {
  title?: string;
  children?: ReactNode;
};

export function Page({ title, children }: PageProps) {
  return (
    <main
      data-slot="page"
      className="min-h-screen bg-background text-foreground"
    >
      <div className="mx-auto max-w-2xl px-6 py-12">
        {title ? (
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        ) : null}
        <div className={title ? "mt-6 space-y-8" : "space-y-8"}>{children}</div>
      </div>
    </main>
  );
}
