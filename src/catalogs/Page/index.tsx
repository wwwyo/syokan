import type { ReactNode } from "react";
import { z } from "zod";

export const pagePropsSchema = z
  .object({
    title: z.string().min(1).optional(),
  })
  .strict();

export type PageProps = z.infer<typeof pagePropsSchema> & {
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
          <h1 className="mb-6 text-3xl font-semibold tracking-tight">
            {title}
          </h1>
        ) : null}
        <div className="space-y-8">{children}</div>
      </div>
    </main>
  );
}
